#!/usr/bin/env python3
"""
PDF 内容提取脚本
使用 PyMuPDF (fitz) 提取论文中的文本、图片、表格
"""

import sys
import json
import os
from pathlib import Path
from typing import Dict, List, Any, Optional
import base64
import io

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({
        "error": "PyMuPDF not installed. Please run: pip install pymupdf"
    }))
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    Image = None

MIN_IMAGE_WIDTH = 80
MIN_IMAGE_HEIGHT = 60
MIN_IMAGE_AREA = 12_000


def emit_json(payload: Dict[str, Any]) -> None:
    """Write JSON using UTF-8 even on Windows terminals with GBK defaults."""
    data = json.dumps(payload, ensure_ascii=False, indent=2)

    try:
        sys.stdout.write(data)
        sys.stdout.write("\n")
    except UnicodeEncodeError:
        sys.stdout.buffer.write(data.encode("utf-8"))
        sys.stdout.buffer.write(b"\n")

def extract_text_from_page(page: fitz.Page) -> Dict[str, Any]:
    """提取页面文本"""
    text = page.get_text()
    
    # 提取文本块
    blocks = page.get_text("blocks")
    structured_text = []
    
    for block in blocks:
        if len(block) >= 7:
            x0, y0, x1, y1, text_content, block_no, block_type = block[:7]
            structured_text.append({
                "bbox": [x0, y0, x1, y1],
                "text": text_content.strip(),
                "type": "text" if block_type == 0 else "image"
            })
    
    return {
        "full_text": text,
        "blocks": structured_text
    }

def to_png_safe_pixmap(pix: fitz.Pixmap) -> fitz.Pixmap:
    """Convert unusual colorspaces into a PNG-safe pixmap."""
    if pix.colorspace is None:
        return fitz.Pixmap(fitz.csRGB, pix)
    if pix.colorspace.n not in (1, 3):
        return fitz.Pixmap(fitz.csRGB, pix)
    if pix.alpha and pix.colorspace.n != 3:
        return fitz.Pixmap(fitz.csRGB, pix)
    return pix

def save_pixmap_png(pix: fitz.Pixmap, target_path: Path) -> fitz.Pixmap:
    """Persist a pixmap as PNG, falling back to Pillow when direct saving fails."""
    png_pix = to_png_safe_pixmap(pix)

    try:
        png_pix.save(str(target_path))
        return png_pix
    except Exception:
        if Image is None:
            raise

        mode = "RGB"
        if png_pix.colorspace is None:
            mode = "RGB"
        elif png_pix.colorspace.n == 1:
            mode = "L"
        elif png_pix.alpha:
            mode = "RGBA"

        image = Image.frombytes(mode, [png_pix.width, png_pix.height], png_pix.samples)
        if mode == "RGBA":
            image = image.convert("RGB")
        image.save(str(target_path), format="PNG")
        return png_pix

def should_keep_image(pix: fitz.Pixmap, bbox: Optional[fitz.Rect]) -> bool:
    if pix.width < MIN_IMAGE_WIDTH or pix.height < MIN_IMAGE_HEIGHT:
        return False
    if pix.width * pix.height < MIN_IMAGE_AREA:
        return False
    if bbox is not None and (bbox.width < 30 or bbox.height < 30):
        return False
    return True

def extract_images_from_page(page: fitz.Page, page_num: int, output_dir: Path) -> List[Dict[str, Any]]:
    """提取页面中的图片"""
    images = []
    
    # 获取页面图片列表
    image_list = page.get_images(full=True)
    
    for img_index, img in enumerate(image_list):
        xref = img[0]
        pix = fitz.Pixmap(page.parent, xref)

        # 获取图片在页面中的位置
        rects = page.get_image_rects(xref)
        bbox = rects[0] if rects else None
        if not should_keep_image(pix, bbox):
            pix = None
            continue

        # 生成图片文件名
        img_filename = f"page_{page_num + 1}_img_{img_index + 1}.png"
        img_path = output_dir / img_filename

        pix = save_pixmap_png(pix, img_path)

        images.append({
            "id": f"img_{page_num + 1}_{img_index + 1}",
            "page": page_num + 1,
            "path": str(img_path.relative_to(output_dir.parent)),
            "filename": img_filename,
            "width": pix.width,
            "height": pix.height,
            "bbox": [bbox.x0, bbox.y0, bbox.x1, bbox.y1] if bbox else None
        })
        
        pix = None
    
    return images

def extract_tables_from_page(page: fitz.Page, page_num: int) -> List[Dict[str, Any]]:
    """提取页面中的表格（基于文本布局分析）"""
    tables = []
    
    # 获取页面文本块
    blocks = page.get_text("blocks")
    
    # 简单的表格检测：寻找对齐的文本列
    # 实际项目中可以使用更复杂的算法或 Camelot 库
    text_blocks = [b for b in blocks if len(b) >= 7 and b[6] == 0]
    
    if len(text_blocks) >= 4:
        # 按 y 坐标分组
        y_groups = {}
        for block in text_blocks:
            y_key = round(block[1] / 10) * 10  # 按 10px 分组
            if y_key not in y_groups:
                y_groups[y_key] = []
            y_groups[y_key].append(block)
        
        # 检测表格：多行且每行有多个块
        table_candidates = []
        for y_key, group in y_groups.items():
            if len(group) >= 2:
                table_candidates.extend(group)
        
        if len(table_candidates) >= 4:
            # 提取表格文本
            table_text = "\n".join([b[4] for b in sorted(table_candidates, key=lambda x: (x[1], x[0]))])
            
            tables.append({
                "id": f"table_{page_num + 1}_1",
                "page": page_num + 1,
                "text": table_text,
                "bbox": [
                    min(b[0] for b in table_candidates),
                    min(b[1] for b in table_candidates),
                    max(b[2] for b in table_candidates),
                    max(b[3] for b in table_candidates)
                ]
            })
    
    return tables

def detect_formulas(text: str, page_num: int) -> List[Dict[str, Any]]:
    """检测文本中的公式（基于简单启发式）"""
    formulas = []
    
    # 简单的公式检测规则
    import re
    
    # 检测 LaTeX 风格的公式
    latex_patterns = [
        (r'\$\$(.+?)\$\$', 'display'),
        (r'\$(.+?)\$', 'inline'),
        (r'\\begin\{equation\}(.+?)\\end\{equation\}', 'display'),
        (r'\\begin\{align\}(.+?)\\end\{align\}', 'display'),
        (r'\\\[(.+?)\\\]', 'display'),
        (r'\\\((.+?)\\\)', 'inline')
    ]
    
    formula_index = 1
    for pattern, formula_type in latex_patterns:
        matches = re.finditer(pattern, text, re.DOTALL)
        for match in matches:
            formulas.append({
                "id": f"formula_{page_num + 1}_{formula_index}",
                "page": page_num + 1,
                "type": formula_type,
                "latex": match.group(1).strip(),
                "raw": match.group(0)
            })
            formula_index += 1
    
    return formulas

def extract_pdf_content(pdf_path: str, output_dir: str, paper_id: str, paper_title: str) -> Dict[str, Any]:
    """提取 PDF 完整内容"""
    pdf_path = Path(pdf_path)
    output_dir = Path(output_dir)
    
    if not pdf_path.exists():
        return {"error": f"PDF file not found: {pdf_path}"}
    
    # 创建输出目录
    paper_output_dir = output_dir / paper_id
    paper_output_dir.mkdir(parents=True, exist_ok=True)
    images_dir = paper_output_dir / "images"
    images_dir.mkdir(exist_ok=True)
    
    try:
        # 打开 PDF
        doc = fitz.open(str(pdf_path))
        
        result = {
            "paperId": paper_id,
            "paperTitle": paper_title,
            "pageCount": len(doc),
            "metadata": {
                "title": doc.metadata.get("title", ""),
                "author": doc.metadata.get("author", ""),
                "subject": doc.metadata.get("subject", ""),
                "creator": doc.metadata.get("creator", ""),
                "producer": doc.metadata.get("producer", "")
            },
            "pages": [],
            "figures": [],
            "tables": [],
            "formulas": [],
            "fullText": ""
        }
        
# Cover extraction disabled - smart figure selection is now handled in pdf-grounding.ts
        # This prioritizes architecture/method diagrams over first-page screenshots
        # if len(doc) > 0:
        #     cover_pix = doc[0].get_pixmap(matrix=fitz.Matrix(2, 2))
        #     cover_path = paper_output_dir / "cover.png"
        #     cover_pix = save_pixmap_png(cover_pix, cover_path)
        #     result["coverPath"] = str(cover_path.relative_to(output_dir.parent))
        
        # 逐页提取
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # 提取文本
            text_data = extract_text_from_page(page)
            
            # 提取图片
            images = extract_images_from_page(page, page_num, images_dir)
            result["figures"].extend(images)
            
            # 提取表格
            tables = extract_tables_from_page(page, page_num)
            result["tables"].extend(tables)
            
            # 检测公式
            formulas = detect_formulas(text_data["full_text"], page_num)
            result["formulas"].extend(formulas)
            
            # 保存页面信息
            result["pages"].append({
                "pageNumber": page_num + 1,
                "text": text_data["full_text"],
                "blocks": text_data["blocks"][:50]  # 限制块数量
            })
            
            result["fullText"] += text_data["full_text"] + "\n"
        
        # 提取摘要（前 1000 字符）
        result["abstract"] = result["fullText"][:1000].strip()
        
        doc.close()
        
        return result
        
    except Exception as e:
        return {"error": f"PDF extraction failed: {str(e)}"}

def main():
    """主函数 - 命令行入口"""
    if len(sys.argv) < 5:
        print(json.dumps({
            "error": "Usage: python pdf_extract.py <pdf_path> <output_dir> <paper_id> <paper_title>"
        }))
        sys.exit(1)
    
    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    paper_id = sys.argv[3]
    paper_title = sys.argv[4]
    
    result = extract_pdf_content(pdf_path, output_dir, paper_id, paper_title)
    
    # 输出 JSON 结果
    emit_json(result)

if __name__ == "__main__":
    main()
