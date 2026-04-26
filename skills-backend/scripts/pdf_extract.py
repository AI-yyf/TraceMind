#!/usr/bin/env python3
"""
Structured PDF extraction for research grounding.

Extraction strategy (priority order):
1. **Marker** — high-accuracy extraction using DocLayout-YOLO layout analysis,
   Nougat/Surya OCR, and structured table/formula recognition (~96.67% accuracy).
2. **PyMuPDF** — fallback when Marker is unavailable; uses heuristic formula
   detection (regex-based) and PyMuPDF's built-in table finder.

This script keeps the Python dependency surface intentionally small while
producing a richer payload for the backend:
- text blocks with layout metadata
- caption-aware figure extraction
- structure-first table extraction via PyMuPDF find_tables()
- high-confidence displayed formula detection
- section recovery and Markdown export for downstream long-form writing
- section-aware asset placement so figures/tables/formulas stay near body text
- per-asset confidence scores and extraction method tagging
"""

from __future__ import annotations

import json
import io
import os
import re
import statistics
import subprocess
import sys
from contextlib import redirect_stderr, redirect_stdout
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# ---------------------------------------------------------------------------
# Marker availability check (optional dependency)
# ---------------------------------------------------------------------------
MARKER_AVAILABLE = False
MARKER_IMPORT_ERROR: Optional[str] = None

try:
    from marker.converters.pdf import PdfConverter
    from marker.models import create_model_dict
    from marker.output import text_from_rendered
    from marker.config.parser import ConfigParser

    MARKER_AVAILABLE = True
except ImportError as exc:
    MARKER_IMPORT_ERROR = str(exc)

# ---------------------------------------------------------------------------
# DocLayout-YOLO availability check (optional, for improved layout analysis)
# ---------------------------------------------------------------------------
DOCLAYOUT_YOLO_AVAILABLE = False

try:
    from doclayout_yolo import YOLOModel  # type: ignore[import-untyped]

    DOCLAYOUT_YOLO_AVAILABLE = True
except ImportError:
    pass

# ---------------------------------------------------------------------------
# PyMuPDF (required for fallback extraction)
# ---------------------------------------------------------------------------
try:
    import fitz  # PyMuPDF
except ImportError:
    print(json.dumps({"error": "PyMuPDF not installed. Please run: pip install pymupdf"}))
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    Image = None

MIN_IMAGE_WIDTH = 120
MIN_IMAGE_HEIGHT = 90
MIN_IMAGE_AREA = 24_000
MIN_UNCAPTIONED_IMAGE_AREA = 80_000
MIN_IMAGE_FRAGMENT_WIDTH = 18
MIN_IMAGE_FRAGMENT_HEIGHT = 18
MIN_IMAGE_FRAGMENT_AREA = 324
FIGURE_CAPTION_RE = re.compile(r"^(?:fig(?:ure)?\.?\s*\d+|图\s*\d+)\b", re.IGNORECASE)
TABLE_CAPTION_RE = re.compile(r"^(?:table\s*\d+|表\s*\d+)\b", re.IGNORECASE)
# Figure group (sub-figure) detection: Figure 1(a), 图1(a), Fig. 1-b, etc.
FIGURE_GROUP_CAPTION_RE = re.compile(
    r"^(?:fig(?:ure)?\.?\s*(\d+)\s*[\(（\-–—]?\s*([a-z0-9]+)\s*[\)（\-–—]?|图\s*(\d+)\s*[\(（\-–—]?\s*([a-z0-9]+)\s*[\)）\-–—]?)",
    re.IGNORECASE
)
SECTION_TITLE_HINT_RE = re.compile(
    r"^(?:\d+(?:\.\d+)*\s+)?(?:abstract|introduction|background|related work|preliminar(?:y|ies)|problem|task|method|methods|approach|model|architecture|training|evaluation|experiments?|results?|discussion|analysis|ablation|limitations?|conclusion|references?|appendix)\b",
    re.IGNORECASE,
)
LOW_VALUE_SECTION_TITLE_RE = re.compile(
    r"^(?:references?|bibliography|appendix|table of contents|contents|list of figures|list of tables|acknowledg(?:e)?ments?|declaration|dedication|copyright)$",
    re.IGNORECASE,
)
LOW_VALUE_TEXT_RE = re.compile(
    r"(?:table of contents|list of figures|list of tables|acknowledg(?:e)?ments?|personal use is permitted|all rights reserved|ieee xplore|cookie|privacy notice|sign in|institutional access|purchase pdf|download pdf|submitted in partial fulfillment|doctor of philosophy|master of science)",
    re.IGNORECASE,
)
HTML_NOISE_RE = re.compile(r"<(?:html|head|body|meta|script|div|span|title)\b|&nbsp;|document\.cookie", re.IGNORECASE)
MATH_GLYPH_RE = re.compile(r"[\u0370-\u03ff\u2200-\u22ff\u2260\u2264\u2265\u00d7\u00f7\u2202\u2207\u2208\u2209\u220b\u2211\u2212\u221e\u2220\u222b\u222c\u222e\u2234\u2235\u2237\u2248\u2261\u226a\u226b\u2282\u2283\u2286\u2287\u2295\u2297\u2299\u22c5\u22c0\u22c1\u27e8\u27e9]")
LATEX_SIGNAL_RE = re.compile(r"\\(?:frac|sum|prod|min|max|argmax|argmin|theta|lambda|sigma|alpha|beta|gamma|delta|epsilon|omega|phi|psi|rho|tau|pi|mu|nu|xi|zeta|eta|kappa|mathbb|mathbf|mathcal|mathrm|mathbf|left|right|log|exp|sin|cos|tan|int|oint|sqrt|hat|bar|tilde|vec|dot|ddot|overline|underline|frac|dfrac|tfrac|begin|end|text|mathrm)")
FORMULA_ASSIGNMENT_RE = re.compile(r"(?:<=|>=|!=|:=|->|=>|≈|≡|∝|=)")
FORMULA_NOISE_RE = re.compile(
    r"(?:"
    # Original noise patterns
    r"figure|table|results?|benchmark|appendix|copyright|personal use|timeline|branch|merge|topic placement|node placement|currently grouped into"
    # URLs and web addresses
    r"|https?://|www\.|\.com|\.org|\.edu|\.pdf|arxiv\.org|doi\.org|scholar\.google"
    r"|google\.com|drive\.google|github\.com|openreview\.net"
    # Arxiv ID patterns (YYYY.XXXXX or old-style arch-ive/YYMMNNN)
    r"|\d{4}\.\d{4,5}(?:v\d+)?"
    r"|ar[xX]iv[:/]?\s*\d{4}\.\d{4,5}"
    r"|[a-z-]+/\d{7}(?:v\d+)?"
    # Bibliography references: [1], [16], [Author et al.]
    r"|\[\d+\]\s*[A-Z]"
    r"|\[\d+\]$"
    r"|et\s+al\.?"
    r"|proceedings\s+of"
    r"|journal\s+of"
    r"|transactions\s+on"
    r"|conference\s+on"
    # Citation patterns with years and volumes
    r"|\(\d{4}\)\s*[,\.]"
    r"|\d{1,4}\s*\(\s*\d{1,4}\s*\)\s*,\s*\d{4}"
    r"|vol\.?\s*\d+"
    r"|pp\.?\s*\d+"
    r"|pages?\s*\d+"
    r"|\d+\s*[-–]\s*\d+"
    # Low-confidence indicators (numbers in isolation, statistical results)
    r"^\d+\s*±\s*\d+$"
    r"^\d+\.?\d*\s*±\s*\d+\.?\d*$"
    # File paths and technical noise
    r"|\.pdf|\.png|\.jpg|\.tex|\.bib"
    r"|context=|article=|abs/"
    # Common prose indicators (long text with many words but no math structure)
    r"|department\s+of|university|institute|laboratory"
    r"|submitted|accepted|published"
    r")",
    re.IGNORECASE,
)
# Math font detection: fonts commonly used for mathematical typesetting
MATH_FONT_RE = re.compile(
    r"(?:symbol|cmsy|cmmi|cmex|cmti|math|stix|xits|asana|latin.modern.math|tex.gyre|"
    r"cambria.math|neu.euler|euler|mathtime|lucida.math|mathpi|mt.?syn|"
    r"mt.?pro|mt.?extra|msam|msbm|eufrak|eusb|rsfs|wasy|tipa|"
    r"computer.modern|modern|ital|oblique)",
    re.IGNORECASE,
)
# Additional math symbol patterns for density-based detection
MATH_SYMBOL_CHARS = set(
    "∑∏∫∮∂∇∈∉⊂⊃⊆⊇∪∩∧∨⊕⊗⊙¬∀∃√∞∠⊥∝≡≈≠≤≥≪≫←→↔↑↓⇒⇔"
    "αβγδεζηθικλμνξπρστυφχψω"
    "ΓΔΘΛΞΠΣΦΨΩ"
    "±×÷·∘†‡⟨⟩"
)

# ---------------------------------------------------------------------------
# Confidence scores by extraction method
# These values are calibrated based on empirical testing:
# - Marker: ~96.67% accuracy on academic PDFs (per Marker paper)
# - PyMuPDF heuristics: lower confidence due to regex-based detection
# ---------------------------------------------------------------------------
CONFIDENCE_MARKER_FORMULA = 0.96
CONFIDENCE_MARKER_FIGURE_CAPTIONED = 0.95
CONFIDENCE_MARKER_FIGURE_UNCAPTIONED = 0.88
CONFIDENCE_MARKER_TABLE_CAPTIONED = 0.96
CONFIDENCE_MARKER_TABLE_UNCAPTIONED = 0.90
CONFIDENCE_MARKER_SECTION = 0.93

CONFIDENCE_PYMUPDF_FORMULA = 0.74  # Current baseline, needs improvement
CONFIDENCE_PYMUPDF_FIGURE_CAPTIONED = 0.92
CONFIDENCE_PYMUPDF_FIGURE_UNCAPTIONED = 0.55  # Current baseline, needs improvement
CONFIDENCE_PYMUPDF_TABLE_CAPTIONED = 0.94
CONFIDENCE_PYMUPDF_TABLE_UNCAPTIONED = 0.78
CONFIDENCE_PYMUPDF_SECTION = 0.85

# LaTeX equation block detection confidence
CONFIDENCE_LATEX_BLOCK_FORMULA = 0.85  # Higher confidence for explicit LaTeX blocks

# DocLayout-YOLO improves uncaptioned figure detection
CONFIDENCE_DOCLAYOUT_FIGURE_UNCAPTIONED = 0.85

# Extraction method identifiers
EXTRACTION_METHOD_MARKER = "marker"
EXTRACTION_METHOD_PYMUPDF = "pymupdf"
EXTRACTION_METHOD_DOCLAYOUT = "doclayout_yolo"


def emit_json(payload: Dict[str, Any]) -> None:
    data = json.dumps(payload, ensure_ascii=False, indent=2)

    try:
        sys.stdout.write(data)
        sys.stdout.write("\n")
    except UnicodeEncodeError:
        sys.stdout.buffer.write(data.encode("utf-8"))
        sys.stdout.buffer.write(b"\n")


def normalize_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def normalize_multiline_text(value: str | None) -> str:
    return re.sub(r"\n{3,}", "\n\n", (value or "").replace("\r\n", "\n")).strip()


def looks_like_low_value_text(value: str | None) -> bool:
    text = normalize_text(value)
    if not text:
        return True
    if HTML_NOISE_RE.search(text):
        return True
    if LOW_VALUE_TEXT_RE.search(text):
        return True
    if re.fullmatch(r"\d{1,4}", text):
        return True
    if re.search(r"\.{4,}", text) and re.search(r"\d{1,4}$", text):
        return True
    return False


def clean_table_cell(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, (int, float, bool)):
        return str(value)
    return normalize_text(str(value))


def to_png_safe_pixmap(pix: fitz.Pixmap) -> fitz.Pixmap:
    if pix.colorspace is None:
        return fitz.Pixmap(fitz.csRGB, pix)
    if pix.colorspace.n not in (1, 3):
        return fitz.Pixmap(fitz.csRGB, pix)
    if pix.alpha and pix.colorspace.n != 3:
        return fitz.Pixmap(fitz.csRGB, pix)
    return pix


def save_pixmap_png(pix: fitz.Pixmap, target_path: Path) -> fitz.Pixmap:
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


def bbox_to_list(rect: fitz.Rect) -> List[float]:
    return [float(rect.x0), float(rect.y0), float(rect.x1), float(rect.y1)]


def rect_key(rect: fitz.Rect) -> tuple[float, float, float, float]:
    return tuple(round(value, 1) for value in bbox_to_list(rect))


def rect_union(rects: Sequence[fitz.Rect]) -> fitz.Rect:
    iterator = iter(rects)
    first = fitz.Rect(next(iterator))
    for rect in iterator:
        first |= fitz.Rect(rect)
    return first


def clamp_rect(rect: fitz.Rect, page_rect: fitz.Rect, padding: float = 0.0) -> fitz.Rect:
    clamped = fitz.Rect(rect)
    if padding:
        clamped = fitz.Rect(
            clamped.x0 - padding,
            clamped.y0 - padding,
            clamped.x1 + padding,
            clamped.y1 + padding,
        )
    clamped.x0 = max(page_rect.x0, clamped.x0)
    clamped.y0 = max(page_rect.y0, clamped.y0)
    clamped.x1 = min(page_rect.x1, clamped.x1)
    clamped.y1 = min(page_rect.y1, clamped.y1)
    return clamped


def should_keep_rect(rect: fitz.Rect, require_large_uncaptioned: bool = False) -> bool:
    width = rect.width
    height = rect.height
    area = width * height
    min_area = MIN_UNCAPTIONED_IMAGE_AREA if require_large_uncaptioned else MIN_IMAGE_AREA
    if width < MIN_IMAGE_WIDTH or height < MIN_IMAGE_HEIGHT:
        return False
    if area < min_area:
        return False
    return True


def should_keep_image_fragment(rect: fitz.Rect) -> bool:
    return (
        rect.width >= MIN_IMAGE_FRAGMENT_WIDTH
        and rect.height >= MIN_IMAGE_FRAGMENT_HEIGHT
        and rect.width * rect.height >= MIN_IMAGE_FRAGMENT_AREA
    )


def extract_text_layout(page: fitz.Page) -> Dict[str, Any]:
    page_dict = page.get_text("dict", sort=True)
    blocks: List[Dict[str, Any]] = []
    text_blocks: List[Dict[str, Any]] = []
    line_entries: List[Dict[str, Any]] = []
    image_blocks: List[Dict[str, Any]] = []

    for block in page_dict.get("blocks", []):
        block_type = block.get("type", 0)
        bbox = [float(value) for value in block.get("bbox", (0, 0, 0, 0))]

        if block_type == 0:
            block_lines: List[str] = []
            font_sizes: List[float] = []

            for line in block.get("lines", []):
                spans = line.get("spans", [])
                line_text = normalize_text("".join(str(span.get("text", "")) for span in spans))
                if not line_text:
                    continue

                line_font_size = max(float(span.get("size", 0.0)) for span in spans) if spans else 0.0
                line_bbox = [float(value) for value in line.get("bbox", bbox)]
                # Extract font names for math font detection
                font_names: List[str] = []
                for span in spans:
                    font_name = str(span.get("font", "") or "")
                    if font_name:
                        font_names.append(font_name)
                line_entries.append(
                    {
                        "bbox": line_bbox,
                        "text": line_text,
                        "fontSize": line_font_size,
                        "fontNames": font_names,
                    }
                )
                block_lines.append(line_text)
                font_sizes.append(line_font_size)

            block_text = normalize_text(" ".join(block_lines))
            if not block_text:
                continue

            entry = {
                "bbox": bbox,
                "text": block_text,
                "type": "text",
                "fontSize": max(font_sizes) if font_sizes else 0.0,
            }
            blocks.append({"bbox": bbox, "text": block_text, "type": "text"})
            text_blocks.append(entry)
        else:
            image_blocks.append({"bbox": bbox})
            blocks.append({"bbox": bbox, "text": "", "type": "image"})

    blocks.sort(key=lambda item: (item["bbox"][1], item["bbox"][0]))
    text_blocks.sort(key=lambda item: (item["bbox"][1], item["bbox"][0]))
    line_entries.sort(key=lambda item: (item["bbox"][1], item["bbox"][0]))

    return {
        "full_text": page.get_text("text", sort=True),
        "blocks": blocks,
        "text_blocks": text_blocks,
        "lines": line_entries,
        "image_blocks": image_blocks,
    }


def find_caption_blocks(blocks: Iterable[Dict[str, Any]], kind: str) -> List[Dict[str, Any]]:
    pattern = FIGURE_CAPTION_RE if kind == "figure" else TABLE_CAPTION_RE
    captions: List[Dict[str, Any]] = []

    for block in blocks:
        text = normalize_text(block.get("text"))
        if not text or len(text) > 800:
            continue
        if pattern.match(text):
            captions.append(block)

    captions.sort(key=lambda item: (item["bbox"][1], item["bbox"][0]))
    return captions


def parse_caption_number(caption: str, fallback: int) -> int:
    match = re.search(r"(\d+)", caption or "")
    return int(match.group(1)) if match else fallback


def collect_image_rects(page: fitz.Page, layout: Dict[str, Any]) -> List[fitz.Rect]:
    rects: List[fitz.Rect] = []
    seen: set[tuple[float, float, float, float]] = set()

    for image in page.get_images(full=True):
        xref = image[0]
        for rect in page.get_image_rects(xref):
            rect = fitz.Rect(rect)
            if not should_keep_image_fragment(rect):
                continue
            key = rect_key(rect)
            if key in seen:
                continue
            seen.add(key)
            rects.append(rect)

    for image_block in layout.get("image_blocks", []):
        rect = fitz.Rect(image_block.get("bbox", (0, 0, 0, 0)))
        if not should_keep_image_fragment(rect):
            continue
        key = rect_key(rect)
        if key in seen:
            continue
        seen.add(key)
        rects.append(rect)

    rects.sort(key=lambda entry: (entry.y0, entry.x0))
    return rects


def rect_matches_caption(rect: fitz.Rect, caption_rect: fitz.Rect, previous_caption_bottom: float) -> bool:
    if rect.y0 < previous_caption_bottom - 8:
        return False

    vertical_gap = caption_rect.y0 - rect.y1
    if vertical_gap < -18 or vertical_gap > 260:
        return False

    rect_center_x = (rect.x0 + rect.x1) / 2
    caption_center_x = (caption_rect.x0 + caption_rect.x1) / 2
    horizontal_center_gap = abs(rect_center_x - caption_center_x)
    max_gap = max(260.0, rect.width * 0.9)
    return horizontal_center_gap <= max_gap


def render_region_to_png(page: fitz.Page, rect: fitz.Rect, target_path: Path) -> fitz.Pixmap:
    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), clip=rect, annots=False)
    return save_pixmap_png(pix, target_path)


def detect_layout_regions_with_doclayout(
    page: fitz.Page,
    page_num: int,
) -> List[Dict[str, Any]]:
    """Use DocLayout-YOLO to detect figure/table/formula regions on a page.

    Returns a list of detected regions with type, bbox, and confidence.
    Falls back to empty list if DocLayout-YOLO is not available.
    """
    if not DOCLAYOUT_YOLO_AVAILABLE:
        return []

    try:
        # Render page to image for YOLO inference
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img_bytes = pix.tobytes("png")

        import tempfile
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp.write(img_bytes)
            tmp_path = tmp.name

        try:
            model = YOLOModel("doclayout_yolo_docstructbench_imgsz640.pt")
            results = model.predict(tmp_path, imgsz=640, conf=0.25)

            regions: List[Dict[str, Any]] = []
            scale = 2.0  # We rendered at 2x

            for result in results:
                boxes = result.boxes
                for box in boxes:
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    cls_id = int(box.cls[0])
                    conf = float(box.conf[0])

                    # Scale back to PDF coordinates
                    bbox = [
                        x1 / scale,
                        y1 / scale,
                        x2 / scale,
                        y2 / scale,
                    ]

                    # DocLayout-YOLO class mapping (common classes)
                    # 0=title, 1=text, 2=abandon, 3=figure, 4=figure_caption,
                    # 5=table, 6=table_caption, 7=table_footnote,
                    # 8=isolate_formula, 9=formula_caption
                    type_map = {
                        3: "figure",
                        4: "figure_caption",
                        5: "table",
                        6: "table_caption",
                        8: "formula",
                        9: "formula_caption",
                    }
                    region_type = type_map.get(cls_id, "unknown")

                    if region_type != "unknown":
                        regions.append({
                            "type": region_type,
                            "bbox": bbox,
                            "confidence": conf,
                            "page": page_num + 1,
                        })

            return regions
        finally:
            os.unlink(tmp_path)

    except Exception:
        return []


def extract_figures_from_page(
    page: fitz.Page,
    page_num: int,
    paper_output_dir: Path,
    images_dir: Path,
    layout: Dict[str, Any],
    doclayout_regions: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    figures: List[Dict[str, Any]] = []
    image_rects = collect_image_rects(page, layout)
    caption_blocks = find_caption_blocks(layout.get("text_blocks", []), "figure")
    used_rects: set[tuple[float, float, float, float]] = set()
    figure_index = 1

    # Build a set of DocLayout-YOLO figure regions for improved uncaptioned detection
    doclayout_figure_bboxes: List[Dict[str, Any]] = []
    if doclayout_regions:
        doclayout_figure_bboxes = [
            r for r in doclayout_regions if r.get("type") == "figure"
        ]

    for caption_index, caption_block in enumerate(caption_blocks, start=1):
        caption_rect = fitz.Rect(caption_block["bbox"])
        previous_caption_bottom = (
            caption_blocks[caption_index - 2]["bbox"][3] if caption_index > 1 else page.rect.y0
        )
        matched_rects = [
            rect
            for rect in image_rects
            if rect_key(rect) not in used_rects
            and rect_matches_caption(rect, caption_rect, previous_caption_bottom)
        ]

        if not matched_rects:
            continue

        region = clamp_rect(rect_union(matched_rects), page.rect, padding=6)
        if not should_keep_rect(region):
            continue

        filename = f"page_{page_num + 1}_figure_{figure_index}.png"
        target_path = images_dir / filename
        pix = render_region_to_png(page, region, target_path)
        caption = normalize_text(caption_block.get("text")) or f"Figure {figure_index}"
        number = parse_caption_number(caption, figure_index)

        # Determine confidence based on extraction method
        confidence = CONFIDENCE_PYMUPDF_FIGURE_CAPTIONED
        extraction_method = EXTRACTION_METHOD_PYMUPDF

        # Check if DocLayout-YOLO also detected this region (boosts confidence)
        if doclayout_figure_bboxes:
            for dl_region in doclayout_figure_bboxes:
                dl_bbox = dl_region.get("bbox", [])
                if len(dl_bbox) == 4:
                    dl_rect = fitz.Rect(dl_bbox)
                    # Check overlap
                    if region.intersects(dl_rect):
                        overlap_area = (region & dl_rect).get_area()
                        union_area = (region | dl_rect).get_area()
                        iou = overlap_area / union_area if union_area > 0 else 0
                        if iou > 0.3:
                            confidence = min(0.97, confidence + 0.05)
                            extraction_method = EXTRACTION_METHOD_DOCLAYOUT
                            break

        figures.append(
            {
                "id": f"figure_{page_num + 1}_{figure_index}",
                "number": number,
                "caption": caption,
                "page": page_num + 1,
                "path": str(target_path.relative_to(paper_output_dir)),
                "filename": filename,
                "width": pix.width,
                "height": pix.height,
                "bbox": bbox_to_list(region),
                "confidence": confidence,
                "extractionMethod": extraction_method,
            }
        )

        for rect in matched_rects:
            used_rects.add(rect_key(rect))
        figure_index += 1

    # Uncaptioned figures: use DocLayout-YOLO regions when available for better detection
    if doclayout_figure_bboxes:
        # Use DocLayout-YOLO detected figure regions that weren't matched to captions
        for dl_region in doclayout_figure_bboxes:
            dl_bbox = dl_region.get("bbox", [])
            dl_conf = dl_region.get("confidence", 0.5)
            if len(dl_bbox) != 4:
                continue

            dl_rect = fitz.Rect(dl_bbox)
            dl_key = rect_key(dl_rect)

            # Skip if already used by a captioned figure
            if dl_key in used_rects:
                continue

            # Check if any existing image rect overlaps significantly
            best_overlap_rect: Optional[fitz.Rect] = None
            best_iou = 0.0
            for rect in image_rects:
                if rect_key(rect) in used_rects:
                    continue
                if rect.intersects(dl_rect):
                    overlap_area = (rect & dl_rect).get_area()
                    union_area = (rect | dl_rect).get_area()
                    iou = overlap_area / union_area if union_area > 0 else 0
                    if iou > best_iou:
                        best_iou = iou
                        best_overlap_rect = rect

            if best_overlap_rect and best_iou > 0.2:
                region = clamp_rect(best_overlap_rect, page.rect, padding=4)
            else:
                # Use the DocLayout-YOLO bbox directly
                region = clamp_rect(dl_rect, page.rect, padding=4)

            if not should_keep_rect(region):
                continue

            filename = f"page_{page_num + 1}_figure_{figure_index}.png"
            target_path = images_dir / filename
            pix = render_region_to_png(page, region, target_path)

            # DocLayout-YOLO provides much higher confidence for uncaptioned figures
            confidence = CONFIDENCE_DOCLAYOUT_FIGURE_UNCAPTIONED * dl_conf

            figures.append(
                {
                    "id": f"figure_{page_num + 1}_{figure_index}",
                    "number": figure_index,
                    "caption": f"Figure {figure_index}",
                    "page": page_num + 1,
                    "path": str(target_path.relative_to(paper_output_dir)),
                    "filename": filename,
                    "width": pix.width,
                    "height": pix.height,
                    "bbox": bbox_to_list(region),
                    "confidence": round(confidence, 2),
                    "extractionMethod": EXTRACTION_METHOD_DOCLAYOUT,
                }
            )
            used_rects.add(dl_key)
            if best_overlap_rect:
                used_rects.add(rect_key(best_overlap_rect))
            figure_index += 1
    else:
        # Fallback: original PyMuPDF-based uncaptioned figure detection
        for rect in image_rects:
            key = rect_key(rect)
            if key in used_rects or not should_keep_rect(rect, require_large_uncaptioned=True):
                continue

            region = clamp_rect(rect, page.rect, padding=4)
            filename = f"page_{page_num + 1}_figure_{figure_index}.png"
            target_path = images_dir / filename
            pix = render_region_to_png(page, region, target_path)

            figures.append(
                {
                    "id": f"figure_{page_num + 1}_{figure_index}",
                    "number": figure_index,
                    "caption": f"Figure {figure_index}",
                    "page": page_num + 1,
                    "path": str(target_path.relative_to(paper_output_dir)),
                    "filename": filename,
                    "width": pix.width,
                    "height": pix.height,
                    "bbox": bbox_to_list(region),
                    "confidence": CONFIDENCE_PYMUPDF_FIGURE_UNCAPTIONED,
                    "extractionMethod": EXTRACTION_METHOD_PYMUPDF,
                }
            )
            figure_index += 1

    return figures


def find_nearest_caption(
    captions: Sequence[Dict[str, Any]],
    target_rect: fitz.Rect,
    max_distance: float = 120.0,
) -> Optional[Dict[str, Any]]:
    best: Optional[Dict[str, Any]] = None
    best_score: Optional[tuple[float, float]] = None

    for caption in captions:
        caption_rect = fitz.Rect(caption["bbox"])
        vertical_gap = min(abs(caption_rect.y0 - target_rect.y1), abs(target_rect.y0 - caption_rect.y1))
        if vertical_gap > max_distance:
            continue

        center_gap = abs(((caption_rect.x0 + caption_rect.x1) / 2) - ((target_rect.x0 + target_rect.x1) / 2))
        score = (vertical_gap, center_gap)
        if best_score is None or score < best_score:
            best = caption
            best_score = score

    return best


def normalize_table_matrix(rows: Sequence[Sequence[Any]]) -> List[List[str]]:
    normalized_rows: List[List[str]] = []
    width = 0

    for row in rows:
        cleaned = [clean_table_cell(cell) for cell in row]
        if any(cleaned):
            normalized_rows.append(cleaned)
            width = max(width, len(cleaned))

    if width == 0:
        return []

    return [row + [""] * (width - len(row)) for row in normalized_rows]


def rows_to_dicts(headers: Sequence[str], rows: Sequence[Sequence[str]]) -> List[Dict[str, str]]:
    return [
        {headers[index]: row[index] if index < len(row) else "" for index in range(len(headers))}
        for row in rows
    ]


def extract_tables_from_page(page: fitz.Page, page_num: int, layout: Dict[str, Any]) -> List[Dict[str, Any]]:
    tables: List[Dict[str, Any]] = []
    caption_blocks = find_caption_blocks(layout.get("text_blocks", []), "table")

    try:
        with redirect_stdout(io.StringIO()), redirect_stderr(io.StringIO()):
            table_finder = page.find_tables()
        table_candidates = list(getattr(table_finder, "tables", []))
    except Exception:
        table_candidates = []

    for index, table in enumerate(table_candidates, start=1):
        bbox = fitz.Rect(table.bbox)
        matrix = normalize_table_matrix(table.extract() or [])
        if len(matrix) < 2 or max((len(row) for row in matrix), default=0) < 2:
            continue

        caption_block = find_nearest_caption(caption_blocks, bbox, max_distance=90.0)
        caption = normalize_text(caption_block.get("text")) if caption_block else f"Table {len(tables) + 1}"
        number = parse_caption_number(caption, len(tables) + 1)
        headers = [cell or f"Column {column + 1}" for column, cell in enumerate(matrix[0])]
        data_rows = rows_to_dicts(headers, matrix[1:])
        raw_text = "\n".join(" | ".join(row) for row in matrix)

        tables.append(
            {
                "id": f"table_{page_num + 1}_{index}",
                "number": number,
                "caption": caption,
                "page": page_num + 1,
                "headers": headers,
                "rows": data_rows,
                "rawText": raw_text,
                "bbox": bbox_to_list(bbox),
                "confidence": CONFIDENCE_PYMUPDF_TABLE_CAPTIONED if caption_block else CONFIDENCE_PYMUPDF_TABLE_UNCAPTIONED,
                "extractionMethod": EXTRACTION_METHOD_PYMUPDF,
            }
        )

    # Fallback: detect tables from text patterns when find_tables() returns few results
    # More aggressive: activate fallback if fewer than 1 table found (was < 2)
    if len(tables) < 1:
        fallback_tables = detect_text_pattern_tables(page_num, layout, caption_blocks, len(tables))
        # Avoid duplicates: skip fallback tables that overlap with already-detected tables
        existing_bboxes = [fitz.Rect(t["bbox"]) for t in tables if t.get("bbox")]
        for ft in fallback_tables:
            ft_bbox = fitz.Rect(ft.get("bbox", (0, 0, 0, 0)))
            is_duplicate = False
            for eb in existing_bboxes:
                if ft_bbox.intersects(eb):
                    overlap_area = (ft_bbox & eb).get_area()
                    union_area = (ft_bbox | eb).get_area()
                    iou = overlap_area / union_area if union_area > 0 else 0
                    if iou > 0.3:
                        is_duplicate = True
                        break
            if not is_duplicate:
                tables.append(ft)

    return tables


def detect_text_pattern_tables(
    page_num: int,
    layout: Dict[str, Any],
    caption_blocks: List[Dict[str, Any]],
    existing_count: int,
) -> List[Dict[str, Any]]:
    """Fallback table detection using text patterns.

    Looks for lines with repeated delimiter patterns (|, tab-separated values)
    that suggest tabular data. Groups consecutive tabular lines into tables.
    """
    tables: List[Dict[str, Any]] = []
    lines = layout.get("lines", [])

    # Find lines that look like table rows
    tabular_lines: List[Dict[str, Any]] = []
    for line in lines:
        text = normalize_text(line.get("text", ""))
        if not text or len(text) < 6:
            continue

        # Pattern 1: Pipe-delimited (e.g., "col1 | col2 | col3")
        pipe_count = text.count("|")
        if pipe_count >= 2:
            # Skip separator lines like "|---|---|"
            if re.fullmatch(r"[\|\s\-:]+", text):
                continue
            tabular_lines.append({**line, "delimiter": "pipe", "col_count": pipe_count + 1})
            continue

        # Pattern 2: Multiple consecutive spaces/tabs suggesting column alignment
        # (e.g., "value1    value2    value3")
        space_groups = re.findall(r"\s{2,}", text)
        if len(space_groups) >= 2:
            # Check if the spacing pattern is consistent (suggests alignment)
            col_count = len(space_groups) + 1
            tabular_lines.append({**line, "delimiter": "whitespace", "col_count": col_count})
            continue

        # Pattern 3: Lines with numeric values in consistent positions
        # (e.g., "0.95  0.87  0.92")
        numeric_tokens = re.findall(r"[\-+]?\d+\.?\d*", text)
        if len(numeric_tokens) >= 3:
            # Check if there are at least 3 numeric values separated by spaces
            parts = re.split(r"\s{2,}", text)
            if len(parts) >= 3:
                tabular_lines.append({**line, "delimiter": "numeric", "col_count": len(parts)})
                continue

    if not tabular_lines:
        return tables

    # Group consecutive tabular lines into table blocks
    current_group: List[Dict[str, Any]] = [tabular_lines[0]]

    for i in range(1, len(tabular_lines)):
        prev = tabular_lines[i - 1]
        curr = tabular_lines[i]

        # Check if lines are close vertically (within 30 points)
        prev_y = prev.get("bbox", [0, 0, 0, 0])[3] if prev.get("bbox") else 0
        curr_y = curr.get("bbox", [0, 0, 0, 0])[1] if curr.get("bbox") else 0

        # Same delimiter type and close vertically
        same_delimiter = prev.get("delimiter") == curr.get("delimiter")
        similar_cols = abs(prev.get("col_count", 0) - curr.get("col_count", 0)) <= 1
        close_vertically = abs(curr_y - prev_y) < 35

        if same_delimiter and similar_cols and close_vertically:
            current_group.append(curr)
        else:
            # Process the current group
            if len(current_group) >= 2:
                table = _build_table_from_text_group(current_group, page_num, caption_blocks, existing_count + len(tables))
                if table:
                    tables.append(table)
            current_group = [curr]

    # Don't forget the last group
    if len(current_group) >= 2:
        table = _build_table_from_text_group(current_group, page_num, caption_blocks, existing_count + len(tables))
        if table:
            tables.append(table)

    return tables


def _build_table_from_text_group(
    group: List[Dict[str, Any]],
    page_num: int,
    caption_blocks: List[Dict[str, Any]],
    table_index: int,
) -> Optional[Dict[str, Any]]:
    """Build a table dict from a group of text lines detected as tabular."""
    if len(group) < 2:
        return None

    # Compute bounding box from all lines in the group
    bboxes = []
    for line in group:
        bbox = line.get("bbox")
        if bbox and len(bbox) == 4:
            bboxes.append(fitz.Rect(bbox))

    if not bboxes:
        return None

    combined_rect = bboxes[0]
    for r in bboxes[1:]:
        combined_rect |= r

    # Parse the rows based on delimiter type
    delimiter = group[0].get("delimiter", "pipe")
    matrix: List[List[str]] = []

    for line in group:
        text = normalize_text(line.get("text", ""))
        if not text:
            continue

        if delimiter == "pipe":
            cells = [cell.strip() for cell in text.split("|") if cell.strip()]
        else:
            cells = re.split(r"\s{2,}", text)
            cells = [c.strip() for c in cells if c.strip()]

        if cells:
            matrix.append(cells)

    if len(matrix) < 2:
        return None

    # Normalize column widths
    max_cols = max(len(row) for row in matrix)
    if max_cols < 2:
        return None

    for row in matrix:
        while len(row) < max_cols:
            row.append("")

    # Find caption
    caption_block = find_nearest_caption(caption_blocks, combined_rect, max_distance=90.0)
    caption = normalize_text(caption_block.get("text")) if caption_block else f"Table {table_index + 1}"
    number = parse_caption_number(caption, table_index + 1)

    headers = [cell or f"Column {i + 1}" for i, cell in enumerate(matrix[0])]
    data_rows = rows_to_dicts(headers, matrix[1:])
    raw_text = "\n".join(" | ".join(row) for row in matrix)

    return {
        "id": f"table_{page_num + 1}_text_{table_index + 1}",
        "number": number,
        "caption": caption,
        "page": page_num + 1,
        "headers": headers,
        "rows": data_rows,
        "rawText": raw_text,
        "bbox": bbox_to_list(combined_rect),
        "confidence": 0.65,  # Lower confidence for text-pattern-based detection
        "extractionMethod": "text_pattern",
    }


def compute_math_symbol_density(text: str) -> float:
    """Compute the ratio of math symbols to non-space characters."""
    non_space = len(re.sub(r"\s", "", text))
    if non_space == 0:
        return 0.0
    math_count = sum(1 for char in text if char in MATH_SYMBOL_CHARS)
    # Also count unicode math ranges
    math_count += len(MATH_GLYPH_RE.findall(text))
    return math_count / non_space


def has_math_font(font_names: List[str]) -> bool:
    """Check if any of the fonts are math fonts."""
    for font_name in font_names:
        if MATH_FONT_RE.search(font_name):
            return True
    return False


def score_formula_signal(text: str, font_names: Optional[List[str]] = None) -> float:
    """Score a text line for formula likelihood. Returns 0.0-1.0 confidence.

    Higher scores indicate higher confidence that the text is a formula.
    Uses multiple signals: math glyphs, LaTeX patterns, assignment operators,
    math fonts, and symbol density.
    """
    normalized = normalize_text(text)
    if len(normalized) < 3 or len(normalized) > 250:
        return 0.0

    # Early rejection for obvious non-formulas
    # URL patterns - never treat URLs as formulas
    if re.search(r"https?://|www\.|\.com|\.org|\.edu|\.pdf", normalized, re.IGNORECASE):
        return 0.0
    # Arxiv IDs and DOIs
    if re.search(r"\d{4}\.\d{4,5}(?:v\d+)?|arxiv[:/]?\s*\d{4}\.\d{4,5}|doi:", normalized, re.IGNORECASE):
        return 0.0
    # Bibliography references: [1], [16], etc.
    if re.match(r"^\[\d+\]", normalized) or re.search(r"\[\d+\]\s*[A-Z][a-z]", normalized):
        return 0.0
    # Journal/conference citations with years
    if re.search(r"\(\d{4}\)\s*[,\.\)]|vol\.?\s*\d+|pp\.?\s*\d+|pages?\s*\d+", normalized, re.IGNORECASE):
        return 0.0
    # Statistical results like "97 ± 2" alone
    if re.match(r"^\d+\.?\d*\s*±\s*\d+\.?\d*$", normalized):
        return 0.0
    # File paths
    if re.search(r"[=/\\][\w-]+[=/\\]|context=|article=|abs/", normalized):
        return 0.0

    # Skip captions and noise
    if FIGURE_CAPTION_RE.match(normalized) or TABLE_CAPTION_RE.match(normalized):
        return 0.0
    if FORMULA_NOISE_RE.search(normalized):
        return 0.0

    score = 0.0
    signals_found = 0

    # Signal 1: Assignment operators (strong signal)
    has_assignment = bool(FORMULA_ASSIGNMENT_RE.search(normalized))
    if has_assignment:
        score += 0.35
        signals_found += 1

    # Signal 2: Math glyphs (strong signal)
    math_glyph_matches = len(MATH_GLYPH_RE.findall(normalized))
    if math_glyph_matches >= 1:
        score += min(0.30, 0.15 * math_glyph_matches)
        signals_found += 1

    # Signal 3: LaTeX patterns (strong signal)
    has_latex = bool(LATEX_SIGNAL_RE.search(normalized))
    if has_latex:
        score += 0.30
        signals_found += 1

    # Signal 4: Math function patterns
    has_function = bool(re.search(r"\b(?:softmax|sigmoid|tanh|relu|exp|log|sin|cos|tan|min|max|argmax|argmin|sqrt|abs|norm)\s*[\(⟨]", normalized, re.IGNORECASE))
    if has_function:
        score += 0.20
        signals_found += 1

    # Signal 5: Math sequences (variable assignment patterns)
    has_math_sequence = bool(
        re.search(r"\b[A-Za-z](?:_[A-Za-z0-9]+)?\s*(?:<=|>=|:=|->|=>|≈|≡|=)\s*[^ ]+", normalized)
        or re.search(r"[A-Za-z]\s*[∈∑Π∀∂∫]", normalized)
        or re.search(r"[∈∑Π∀∂∫]\s*[A-Za-z]", normalized)
    )
    if has_math_sequence:
        score += 0.25
        signals_found += 1

    # Signal 6: Math symbol density
    math_density = compute_math_symbol_density(normalized)
    if math_density >= 0.15:
        score += min(0.25, math_density * 0.8)
        signals_found += 1

    # Signal 7: Math font detection (if font info available)
    if font_names and has_math_font(font_names):
        score += 0.20
        signals_found += 1

    # Signal 8: Single-letter variable patterns (common in formulas)
    single_letters = len(re.findall(r"\b[A-Za-z]\b", normalized))
    if single_letters >= 3:
        # Many single letters suggest mathematical notation
        score += min(0.15, 0.05 * single_letters)
        signals_found += 1

    # Signal 9: Subscript/superscript patterns
    has_subscript = bool(re.search(r"[A-Za-z]_[A-Za-z0-9]+", normalized))
    has_superscript = bool(re.search(r"[A-Za-z]\^[A-Za-z0-9]+", normalized))
    if has_subscript or has_superscript:
        score += 0.15
        signals_found += 1

    # Signal 10: Bracket patterns common in math
    bracket_pairs = len(re.findall(r"[\(\)\[\]\{\}⟨⟩]", normalized))
    if bracket_pairs >= 2:
        score += min(0.10, 0.05 * bracket_pairs)
        signals_found += 1

    # Penalize very long text with many words (likely prose)
    word_count = len(re.findall(r"\b[A-Za-z]{3,}\b", normalized))
    token_count = len(normalized.split())

    # Adjust score based on text characteristics
    if word_count > 12 and signals_found < 2:
        # Many words but few signals - likely prose
        score *= 0.5
    elif word_count > 8 and signals_found < 3:
        score *= 0.7

    if token_count > 30 and signals_found < 2:
        score *= 0.6

    # Boost score if multiple signals found
    if signals_found >= 3:
        score = min(1.0, score * 1.2)
    elif signals_found >= 2:
        score = min(1.0, score * 1.1)

    return min(1.0, max(0.0, score))


def has_formula_signal(text: str, font_names: Optional[List[str]] = None) -> bool:
    """Check if text looks like a formula. Uses stricter heuristics.

    This is a convenience wrapper around score_formula_signal for backward compatibility.
    Threshold raised from 0.25 to 0.40 to reduce false positives from references and URLs.
    """
    return score_formula_signal(text, font_names) >= 0.40


def extract_formulas_from_page_with_crops(
    page: fitz.Page,
    layout: Dict[str, Any],
    page_num: int,
    paper_output_dir: Path,
    formulas_dir: Path,
    doclayout_regions: Optional[List[Dict[str, Any]]] = None,
) -> List[Dict[str, Any]]:
    formulas: List[Dict[str, Any]] = []
    seen: set[str] = set()
    index = 1

    # If DocLayout-YOLO detected formula regions, use those for higher confidence
    doclayout_formula_bboxes: List[Dict[str, Any]] = []
    if doclayout_regions:
        doclayout_formula_bboxes = [
            r for r in doclayout_regions if r.get("type") == "formula"
        ]

    for line in layout.get("lines", []):
        text = normalize_text(line.get("text"))
        font_names = line.get("fontNames", [])
        formula_score = score_formula_signal(text, font_names)
        if formula_score < 0.40:
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)

        bbox = fitz.Rect(line.get("bbox", (0, 0, 0, 0)))
        crop_rect = clamp_rect(bbox, page.rect, padding=8)
        crop_path: Optional[str] = None
        if crop_rect.width >= 36 and crop_rect.height >= 18:
            filename = f"page_{page_num + 1}_formula_{index}.png"
            target_path = formulas_dir / filename
            render_region_to_png(page, crop_rect, target_path)
            crop_path = str(target_path.relative_to(paper_output_dir))

        # Compute confidence based on formula score and extraction method
        # Scale the base PyMuPDF confidence by the formula signal score
        base_confidence = CONFIDENCE_PYMUPDF_FORMULA
        # Boost confidence for high-scoring formulas
        if formula_score >= 0.7:
            base_confidence = 0.85
        elif formula_score >= 0.5:
            base_confidence = 0.80
        elif formula_score >= 0.35:
            base_confidence = 0.75

        # Further boost if math fonts detected
        if font_names and has_math_font(font_names):
            base_confidence = min(0.92, base_confidence + 0.08)

        confidence = base_confidence
        extraction_method = EXTRACTION_METHOD_PYMUPDF

        if doclayout_formula_bboxes:
            for dl_region in doclayout_formula_bboxes:
                dl_bbox = dl_region.get("bbox", [])
                if len(dl_bbox) == 4:
                    dl_rect = fitz.Rect(dl_bbox)
                    if bbox.intersects(dl_rect):
                        overlap_area = (bbox & dl_rect).get_area()
                        union_area = (bbox | dl_rect).get_area()
                        iou = overlap_area / union_area if union_area > 0 else 0
                        if iou > 0.2:
                            confidence = min(0.95, base_confidence + 0.10 * dl_region.get("confidence", 0.5))
                            extraction_method = EXTRACTION_METHOD_DOCLAYOUT
                            break

        formulas.append(
            {
                "id": f"formula_{page_num + 1}_{index}",
                "number": str(index),
                "page": page_num + 1,
                "type": "display",
                "latex": text,
                "raw": text,
                "bbox": line.get("bbox"),
                "path": crop_path,
                "confidence": round(confidence, 2),
                "extractionMethod": extraction_method,
                "formulaScore": round(formula_score, 2),
            }
        )
        index += 1

    # Add DocLayout-YOLO formula regions that weren't matched by heuristics
    if doclayout_formula_bboxes:
        for dl_region in doclayout_formula_bboxes:
            dl_bbox = dl_region.get("bbox", [])
            dl_conf = dl_region.get("confidence", 0.5)
            if len(dl_bbox) != 4:
                continue

            dl_rect = fitz.Rect(dl_bbox)

            # Check if this region was already captured by heuristic detection
            already_captured = False
            for formula in formulas:
                formula_bbox = formula.get("bbox")
                if formula_bbox and len(formula_bbox) == 4:
                    formula_rect = fitz.Rect(formula_bbox)
                    if dl_rect.intersects(formula_rect):
                        overlap_area = (dl_rect & formula_rect).get_area()
                        union_area = (dl_rect | formula_rect).get_area()
                        iou = overlap_area / union_area if union_area > 0 else 0
                        if iou > 0.2:
                            already_captured = True
                            break

            if already_captured:
                continue

            # Render the formula region as an image
            crop_rect = clamp_rect(dl_rect, page.rect, padding=8)
            crop_path: Optional[str] = None
            if crop_rect.width >= 36 and crop_rect.height >= 18:
                filename = f"page_{page_num + 1}_formula_{index}.png"
                target_path = formulas_dir / filename
                render_region_to_png(page, crop_rect, target_path)
                crop_path = str(target_path.relative_to(paper_output_dir))

            formulas.append(
                {
                    "id": f"formula_{page_num + 1}_{index}",
                    "number": str(index),
                    "page": page_num + 1,
                    "type": "display",
                    "latex": "",  # DocLayout-YOLO doesn't provide LaTeX text
                    "raw": f"[formula_region_{index}]",
                    "bbox": dl_bbox,
                    "path": crop_path,
                    "confidence": round(CONFIDENCE_DOCLAYOUT_FIGURE_UNCAPTIONED * dl_conf, 2),
                    "extractionMethod": EXTRACTION_METHOD_DOCLAYOUT,
                }
            )
            index += 1

    return formulas


def extract_latex_equation_blocks_from_text(
    full_text: str,
    pages: Sequence[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Extract LaTeX equation blocks from text content.

    Detects \\begin{equation}...\\end{equation} and similar LaTeX environments
    that may be present in the extracted text. These are often higher quality
    than heuristic-based formula detection.

    Returns a list of formula dicts with high confidence scores.
    """
    formulas: List[Dict[str, Any]] = []
    seen: set[str] = set()
    index = 1

    # LaTeX equation environments to detect
    equation_envs = [
        (r"\\begin\{equation\*?\}", r"\\end\{equation\*?\}"),
        (r"\\begin\{align\*?\}", r"\\end\{align\*?\}"),
        (r"\\begin\{gather\*?\}", r"\\end\{gather\*?\}"),
        (r"\\begin\{multline\*?\}", r"\\end\{multline\*?\}"),
        (r"\\begin\{eqnarray\*?\}", r"\\end\{eqnarray\*?\}"),
        (r"\\begin\{displaymath\}", r"\\end\{displaymath\}"),
    ]

    for begin_pattern, end_pattern in equation_envs:
        # Find all equation blocks
        pattern = re.compile(
            rf"({begin_pattern})([\s\S]+?)({end_pattern})",
            re.MULTILINE
        )

        for match in pattern.finditer(full_text):
            latex = match.group(2).strip()
            if not latex or len(latex) < 3:
                continue

            # Normalize for deduplication
            key = latex.lower()
            if key in seen:
                continue
            seen.add(key)

            # Try to find the page number
            page_num = 0
            match_start = match.start()
            char_count = 0
            for page in pages:
                page_text = page.get("text", "")
                page_len = len(page_text)
                if char_count <= match_start < char_count + page_len:
                    page_num = page.get("pageNumber", 0)
                    break
                char_count += page_len + 1  # +1 for newline

            formulas.append({
                "id": f"formula_latex_block_{index}",
                "number": str(index),
                "page": page_num,
                "type": "display",
                "latex": latex,
                "raw": latex,
                "bbox": None,
                "path": None,
                "confidence": CONFIDENCE_LATEX_BLOCK_FORMULA,
                "extractionMethod": "latex_block",
            })
            index += 1

    return formulas


def merge_formula_sources(
    heuristic_formulas: List[Dict[str, Any]],
    latex_block_formulas: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge formulas from multiple extraction sources.

    Prioritizes higher-confidence sources when the same formula is detected
    by multiple methods. LaTeX block formulas have higher confidence than
    heuristic-based detection.

    Returns deduplicated, merged formula list.
    """
    # Index formulas by normalized latex content
    formula_map: Dict[str, Dict[str, Any]] = {}

    # Add heuristic formulas first (lower priority)
    for formula in heuristic_formulas:
        latex = normalize_text(formula.get("latex", "") or formula.get("raw", ""))
        if not latex:
            continue
        key = latex.lower()
        if key not in formula_map:
            formula_map[key] = formula

    # Override with LaTeX block formulas (higher priority)
    for formula in latex_block_formulas:
        latex = normalize_text(formula.get("latex", "") or formula.get("raw", ""))
        if not latex:
            continue
        key = latex.lower()

        existing = formula_map.get(key)
        if existing:
            # Keep the higher confidence version
            existing_conf = existing.get("confidence", 0)
            new_conf = formula.get("confidence", 0)
            if new_conf > existing_conf:
                formula_map[key] = formula
            else:
                # Merge: keep page info from existing if available
                if existing.get("page", 0) == 0 and formula.get("page", 0) > 0:
                    formula_map[key]["page"] = formula["page"]
                if not existing.get("bbox") and formula.get("bbox"):
                    formula_map[key]["bbox"] = formula["bbox"]
        else:
            formula_map[key] = formula

    # Sort by page number
    result = list(formula_map.values())
    result.sort(key=lambda f: (f.get("page", 0), f.get("number", "")))

    # Re-number formulas
    for i, formula in enumerate(result, start=1):
        formula["number"] = str(i)
        formula["id"] = f"formula_merged_{i}"

    return result


def collect_repeated_lines(pages: Sequence[Dict[str, Any]]) -> set[str]:
    counts: Dict[str, int] = {}

    for page in pages:
        seen_on_page = {
            normalize_text(line.get("text"))
            for line in page.get("lines", [])
            if 8 <= len(normalize_text(line.get("text"))) <= 160
        }
        for text in seen_on_page:
            if not text:
                continue
            counts[text] = counts.get(text, 0) + 1

    threshold = 3 if len(pages) >= 6 else 2
    return {
        text
        for text, count in counts.items()
        if count >= threshold and (LOW_VALUE_TEXT_RE.search(text) or len(text) >= 40)
    }


def normalize_section_title(value: str) -> str:
    return normalize_text(re.sub(r"^\d+(?:\.\d+)*\s*", "", value or ""))


def is_heading_candidate(text: str, font_size: float, heading_threshold: float) -> bool:
    normalized = normalize_text(text)
    if not normalized or len(normalized) > 90:
        return False
    if FIGURE_CAPTION_RE.match(normalized) or TABLE_CAPTION_RE.match(normalized):
        return False
    if re.fullmatch(r"\d{1,4}", normalized):
        return False
    if SECTION_TITLE_HINT_RE.match(normalized):
        return True
    if normalized.endswith("."):
        return False
    word_count = len(normalized.split())
    return font_size >= heading_threshold and word_count <= 12


def build_document_sections(pages: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if not pages:
        return []

    repeated_lines = collect_repeated_lines(pages)
    font_sizes = [
        float(line.get("fontSize", 0.0))
        for page in pages
        for line in page.get("lines", [])
        if float(line.get("fontSize", 0.0)) > 0
    ]
    median_font_size = statistics.median(font_sizes) if font_sizes else 11.0
    heading_threshold = median_font_size + 1.2
    sections: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None

    def flush_current() -> None:
        nonlocal current
        if not current:
            return
        paragraphs = [
            paragraph
            for paragraph in current.get("paragraphs", [])
            if paragraph and not looks_like_low_value_text(paragraph)
        ]
        if paragraphs and not LOW_VALUE_SECTION_TITLE_RE.match(current["sourceSectionTitle"]):
            sections.append(
                {
                    "sourceSectionTitle": current["sourceSectionTitle"],
                    "editorialTitle": current["editorialTitle"],
                    "paragraphs": paragraphs,
                    "pageStart": current["pageStart"],
                    "pageEnd": current["pageEnd"],
                }
            )
        current = None

    for page in pages:
        for block in page.get("text_blocks", []):
            text = normalize_text(block.get("text"))
            if not text or text in repeated_lines:
                continue
            if FIGURE_CAPTION_RE.match(text) or TABLE_CAPTION_RE.match(text):
                continue

            font_size = float(block.get("fontSize", 0.0))
            if is_heading_candidate(text, font_size, heading_threshold):
                title = normalize_section_title(text)
                if title.lower().startswith("arxiv:"):
                    continue
                if LOW_VALUE_SECTION_TITLE_RE.match(title):
                    if re.match(r"^(?:references?|bibliography)$", title, re.IGNORECASE):
                        flush_current()
                        return sections[:12]
                    continue

                flush_current()
                current = {
                    "sourceSectionTitle": title,
                    "editorialTitle": title,
                    "paragraphs": [],
                    "pageStart": page["pageNumber"],
                    "pageEnd": page["pageNumber"],
                }
                continue

            if looks_like_low_value_text(text):
                continue

            if current is None:
                current = {
                    "sourceSectionTitle": "Introduction",
                    "editorialTitle": "Introduction",
                    "paragraphs": [],
                    "pageStart": page["pageNumber"],
                    "pageEnd": page["pageNumber"],
                }

            if not current["paragraphs"] or current["paragraphs"][-1] != text:
                current["paragraphs"].append(text)
                current["pageEnd"] = page["pageNumber"]

    flush_current()
    return sections[:12]


def to_markdown_table(headers: Sequence[str], rows: Sequence[Dict[str, str]]) -> str:
    if not headers:
        return ""

    header_row = "| " + " | ".join(headers) + " |"
    separator_row = "| " + " | ".join("---" for _ in headers) + " |"
    body_rows = [
        "| " + " | ".join((row.get(header) or "").replace("\n", " ") for header in headers) + " |"
        for row in rows[:12]
    ]
    return "\n".join([header_row, separator_row, *body_rows])


def get_asset_identifier(asset: Dict[str, Any]) -> str:
    identifier = normalize_text(str(asset.get("id") or ""))
    if identifier:
        return identifier

    page = int(asset.get("page") or 0)
    number = normalize_text(str(asset.get("number") or ""))
    bbox = asset.get("bbox") if isinstance(asset.get("bbox"), list) else []
    bbox_key = ",".join(str(round(float(value), 1)) for value in bbox[:4]) if bbox else ""
    return f"page:{page}|number:{number}|bbox:{bbox_key}"


def get_asset_sort_key(kind: str, asset: Dict[str, Any]) -> tuple[int, float, float, int]:
    page = int(asset.get("page") or 0)
    bbox = asset.get("bbox") if isinstance(asset.get("bbox"), list) else []
    x = float(bbox[0]) if len(bbox) >= 1 else 0.0
    y = float(bbox[1]) if len(bbox) >= 2 else 0.0
    kind_rank = {"figure": 0, "table": 1, "formula": 2}.get(kind, 9)
    return (page, y, x, kind_rank)


def get_section_page_range(section: Dict[str, Any], fallback_index: int) -> tuple[int, int]:
    page_start = int(section.get("pageStart") or 0)
    page_end = int(section.get("pageEnd") or page_start)

    if page_start <= 0 and page_end <= 0:
        return (fallback_index + 1, fallback_index + 1)
    if page_start <= 0:
        page_start = page_end
    if page_end <= 0:
        page_end = page_start
    if page_end < page_start:
        page_end = page_start

    return (page_start, page_end)


def assign_assets_to_sections(
    sections: Sequence[Dict[str, Any]],
    figures: Sequence[Dict[str, Any]],
    tables: Sequence[Dict[str, Any]],
    formulas: Sequence[Dict[str, Any]],
) -> tuple[List[List[tuple[str, Dict[str, Any]]]], List[tuple[str, Dict[str, Any]]]]:
    section_buckets: List[List[tuple[str, Dict[str, Any]]]] = [[] for _ in sections]
    leftovers: List[tuple[str, Dict[str, Any]]] = []
    section_ranges = [get_section_page_range(section, index) for index, section in enumerate(sections)]
    assets = [
        *[("figure", figure) for figure in figures],
        *[("table", table) for table in tables],
        *[("formula", formula) for formula in formulas],
    ]

    if not sections:
        return (section_buckets, sorted(assets, key=lambda entry: get_asset_sort_key(entry[0], entry[1])))

    for kind, asset in assets:
        asset_page = int(asset.get("page") or 0)
        if asset_page <= 0:
            leftovers.append((kind, asset))
            continue

        best_index: Optional[int] = None
        best_score: Optional[tuple[int, int]] = None
        for index, (page_start, page_end) in enumerate(section_ranges):
            if page_start <= asset_page <= page_end:
                score = (0, index)
            elif asset_page > page_end:
                score = (asset_page - page_end, index)
            else:
                score = (page_start - asset_page, index)

            if best_score is None or score < best_score:
                best_index = index
                best_score = score

        if best_index is None:
            leftovers.append((kind, asset))
            continue

        section_buckets[best_index].append((kind, asset))

    for bucket in section_buckets:
        bucket.sort(key=lambda entry: get_asset_sort_key(entry[0], entry[1]))

    leftovers.sort(key=lambda entry: get_asset_sort_key(entry[0], entry[1]))
    return (section_buckets, leftovers)


def render_markdown_asset(kind: str, asset: Dict[str, Any]) -> List[str]:
    if kind == "figure":
        caption = normalize_text(asset.get("caption")) or "Figure"
        image_path = str(asset.get("path") or "").replace("\\", "/")
        parts = []
        if image_path:
            parts.append(f"![{caption}]({image_path})")
        parts.append(f"*{caption}*")
        return parts

    if kind == "table":
        caption = normalize_text(asset.get("caption")) or "Table"
        table_md = to_markdown_table(asset.get("headers") or [], asset.get("rows") or [])
        return [
            f"**{caption}**",
            table_md or normalize_text(asset.get("rawText")),
        ]

    label = normalize_text(f"Formula {asset.get('number') or ''}").strip()
    math_body = normalize_text(asset.get("latex") or asset.get("raw"))
    return [
        f"**{label or 'Formula'}**",
        "```math",
        math_body,
        "```",
    ]


def build_markdown_document(
    paper_title: str,
    sections: Sequence[Dict[str, Any]],
    figures: Sequence[Dict[str, Any]],
    tables: Sequence[Dict[str, Any]],
    formulas: Sequence[Dict[str, Any]],
) -> str:
    parts: List[str] = []
    section_assets, remaining_assets = assign_assets_to_sections(sections, figures, tables, formulas)

    if normalize_text(paper_title):
        parts.append(f"# {normalize_text(paper_title)}")

    for section_index, section in enumerate(sections):
        title = normalize_text(section.get("editorialTitle") or section.get("sourceSectionTitle"))
        if title:
            parts.append(f"## {title}")
        for paragraph in section.get("paragraphs", []):
            cleaned = normalize_text(paragraph)
            if cleaned:
                parts.append(cleaned)

        for kind, asset in section_assets[section_index]:
            parts.extend(render_markdown_asset(kind, asset))

    if remaining_assets:
        parts.append("## Evidence Appendix")
        for kind, asset in remaining_assets:
            parts.extend(render_markdown_asset(kind, asset))

    return normalize_multiline_text("\n\n".join(part for part in parts if normalize_text(part)))


def detect_figure_groups(figures: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Detect figure groups (组图) from a list of extracted figures.

    A figure group is identified when multiple figures share a common figure number
    with different sub-identifiers (e.g., Figure 1(a), Figure 1(b), Figure 1(c)).

    Returns a list of figure group dicts, each containing:
      - groupId: unique identifier for the group
      - parentNumber: the shared figure number
      - caption: the group caption (from the first sub-figure)
      - subFigures: list of sub-figure dicts with their indices
      - confidence: minimum confidence among sub-figures
      - extractionMethod: method used for extraction
    """
    groups: Dict[str, List[Dict[str, Any]]] = {}

    for figure in figures:
        caption = normalize_text(figure.get("caption", ""))

        # Try to match sub-figure patterns
        match = FIGURE_GROUP_CAPTION_RE.match(caption)

        if match:
            # Extract group number from whichever capture group matched
            group_num = match.group(1) or match.group(3) or ""
            sub_id = match.group(2) or match.group(4) or ""

            if group_num:
                group_key = f"figure_group_{group_num}"
                if group_key not in groups:
                    groups[group_key] = []
                groups[group_key].append({
                    "figure": figure,
                    "subId": sub_id,
                    "groupNumber": int(group_num) if group_num.isdigit() else group_num,
                })

    # Only return groups with more than one sub-figure
    result: List[Dict[str, Any]] = []
    for group_key, sub_entries in groups.items():
        if len(sub_entries) < 2:
            continue

        # Sort sub-figures by their sub-identifier
        sub_entries.sort(key=lambda e: e["subId"])

        # Compute group-level confidence
        confidences = [
            e["figure"].get("confidence", 0.5)
            for e in sub_entries
            if isinstance(e["figure"].get("confidence"), (int, float))
        ]
        min_confidence = min(confidences) if confidences else 0.5

        # Use the first sub-figure's caption as group caption
        first_caption = normalize_text(sub_entries[0]["figure"].get("caption", ""))

        # Determine extraction method (use the most common one)
        methods = [e["figure"].get("extractionMethod", "pymupdf") for e in sub_entries]
        method_counts: Dict[str, int] = {}
        for m in methods:
            method_counts[m] = method_counts.get(m, 0) + 1
        best_method = max(method_counts, key=method_counts.get) if method_counts else "pymupdf"

        result.append({
            "groupId": group_key,
            "parentNumber": sub_entries[0]["groupNumber"],
            "caption": first_caption,
            "subFigures": [
                {
                    "index": chr(ord('a') + i) if i < 26 else str(i + 1),
                    "figureId": e["figure"].get("id", ""),
                    "subId": e["subId"],
                    "imagePath": e["figure"].get("path", ""),
                    "caption": normalize_text(e["figure"].get("caption", "")),
                    "page": e["figure"].get("page", 0),
                    "confidence": e["figure"].get("confidence"),
                }
                for i, e in enumerate(sub_entries)
            ],
            "confidence": round(min_confidence, 2),
            "extractionMethod": best_method,
        })

    return result


def extract_pdf_content(
    pdf_path: str,
    output_dir: str,
    paper_id: str,
    paper_title: str,
    prefer_marker: bool = True,
) -> Dict[str, Any]:
    """Extract PDF content with optional Marker primary extraction.

    Args:
        pdf_path: Path to the PDF file
        output_dir: Output directory for extracted assets
        paper_id: Unique identifier for the paper
        paper_title: Title of the paper
        prefer_marker: If True, try Marker first; fall back to PyMuPDF

    Returns:
        Dict with extraction results matching the standard JSON schema
    """
    pdf_path_obj = Path(pdf_path)
    output_root = Path(output_dir)

    if not pdf_path_obj.exists():
        return {"error": f"PDF file not found: {pdf_path_obj}"}

    # Try Marker first if preferred and available
    if prefer_marker and MARKER_AVAILABLE:
        try:
            marker_result = extract_with_marker(pdf_path, output_dir, paper_id, paper_title)
            if "error" not in marker_result:
                return marker_result
            # If Marker failed but didn't crash, log and fall back
            import warnings
            warnings.warn(f"Marker extraction failed, falling back to PyMuPDF: {marker_result.get('error')}")
        except Exception as exc:
            import warnings
            warnings.warn(f"Marker extraction raised exception, falling back to PyMuPDF: {exc}")

    # Fallback: PyMuPDF extraction
    return extract_with_pymupdf(pdf_path, output_dir, paper_id, paper_title)


def extract_with_marker(
    pdf_path: str,
    output_dir: str,
    paper_id: str,
    paper_title: str,
) -> Dict[str, Any]:
    """Extract PDF content using Marker library.

    This is a lightweight wrapper that calls marker_extract.py logic inline.
    For full Marker extraction, use marker_extract.py directly.
    """
    if not MARKER_AVAILABLE:
        return {"error": "marker_not_available"}

    pdf_path_obj = Path(pdf_path)
    output_root = Path(output_dir)
    paper_output_dir = output_root / paper_id
    paper_output_dir.mkdir(parents=True, exist_ok=True)
    images_dir = paper_output_dir / "images"
    images_dir.mkdir(exist_ok=True)
    formulas_dir = paper_output_dir / "formula-crops"
    formulas_dir.mkdir(exist_ok=True)

    try:
        config_parser = ConfigParser({})
        model_dict = create_model_dict()
        converter = PdfConverter(
            config=config_parser.generate_config(),
            artifact_dict=model_dict,
        )

        rendered = converter(str(pdf_path_obj))
        markdown_text, metadata, images = text_from_rendered(rendered)

        # Extract structured data from Marker's output
        formulas = extract_latex_formulas_from_markdown(markdown_text)
        tables = extract_tables_from_markdown(markdown_text)
        sections = extract_sections_from_markdown(markdown_text)
        figures = extract_figures_from_marker_images(images, paper_output_dir, images_dir)

        # Get page count from PyMuPDF if available
        page_count = 0
        full_text = markdown_text
        pages: List[Dict[str, Any]] = []

        try:
            doc = fitz.open(str(pdf_path_obj))
            page_count = len(doc)
            for page_num in range(page_count):
                page = doc[page_num]
                pages.append({
                    "pageNumber": page_num + 1,
                    "text": page.get_text("text", sort=True),
                    "blocks": [],
                })
            full_text = "\n".join(p.get("text", "") for p in pages)
            doc.close()
        except Exception:
            page_count = max(1, len(markdown_text) // 3000)

        # Extract abstract
        abstract = ""
        abstract_section = next(
            (s for s in sections if normalize_text(s.get("sourceSectionTitle", "")) == "Abstract"),
            None,
        )
        if abstract_section:
            abstract = normalize_multiline_text("\n\n".join(abstract_section.get("paragraphs", [])[:3]))
        else:
            abstract = normalize_text(markdown_text[:1200])

        result: Dict[str, Any] = {
            "paperId": paper_id,
            "paperTitle": paper_title,
            "pageCount": page_count,
            "metadata": {
                "title": metadata.get("title", "") if isinstance(metadata, dict) else "",
                "author": metadata.get("author", "") if isinstance(metadata, dict) else "",
                "subject": "",
                "creator": "marker",
                "producer": "",
            },
            "pages": pages,
            "figures": figures,
            "tables": tables,
            "formulas": formulas,
            "sections": sections,
            "figureGroups": detect_figure_groups(figures),
            "markdown": normalize_multiline_text(markdown_text),
            "fullText": full_text or markdown_text,
            "abstract": abstract,
            "extractionMethod": EXTRACTION_METHOD_MARKER,
        }

        return result

    except Exception as error:
        return {"error": f"Marker extraction failed: {error}"}


def extract_latex_formulas_from_markdown(markdown_text: str) -> List[Dict[str, Any]]:
    """Extract display-mode LaTeX formulas from Marker's markdown output."""
    formulas: List[Dict[str, Any]] = []
    seen: set[str] = set()
    index = 1

    for match in re.finditer(r"\$\$\s*([\s\S]+?)\s*\$\$", markdown_text):
        latex = match.group(1).strip()
        if not latex or len(latex) < 3:
            continue
        key = latex.lower()
        if key in seen:
            continue
        seen.add(key)

        formulas.append({
            "id": f"formula_marker_{index}",
            "number": str(index),
            "page": 0,
            "type": "display",
            "latex": latex,
            "raw": latex,
            "bbox": None,
            "path": None,
            "confidence": CONFIDENCE_MARKER_FORMULA,
            "extractionMethod": EXTRACTION_METHOD_MARKER,
        })
        index += 1

    return formulas


def extract_tables_from_markdown(markdown_text: str) -> List[Dict[str, Any]]:
    """Extract tables from Marker's markdown output."""
    tables: List[Dict[str, Any]] = []
    index = 1

    table_pattern = re.compile(r"((?:^\|[^\n]+\|\n)+)", re.MULTILINE)

    for match in table_pattern.finditer(markdown_text):
        table_text = match.group(1).strip()
        lines = [line.strip() for line in table_text.split("\n") if line.strip()]
        if len(lines) < 2:
            continue

        header_cells = [cell.strip() for cell in lines[0].strip("|").split("|")]

        data_lines = []
        for line in lines[1:]:
            if re.match(r"^\|[\s\-:|]+\|$", line):
                continue
            data_lines.append(line)

        if not data_lines:
            continue

        rows: List[Dict[str, str]] = []
        for line in data_lines:
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            row_dict = {}
            for col_idx, cell in enumerate(cells):
                header = header_cells[col_idx] if col_idx < len(header_cells) else f"Column {col_idx + 1}"
                row_dict[header] = cell
            rows.append(row_dict)

        caption = f"Table {index}"
        table_start = match.start()
        preceding_text = markdown_text[:table_start].strip()
        preceding_lines = preceding_text.split("\n")
        for prev_line in reversed(preceding_lines[-3:]):
            prev_line = prev_line.strip()
            if TABLE_CAPTION_RE.match(prev_line):
                caption = prev_line
                break

        has_caption = caption != f"Table {index}"
        raw_text = "\n".join(lines)

        tables.append({
            "id": f"table_marker_{index}",
            "number": index,
            "caption": caption,
            "page": 0,
            "headers": header_cells,
            "rows": rows,
            "rawText": raw_text,
            "bbox": None,
            "confidence": CONFIDENCE_MARKER_TABLE_CAPTIONED if has_caption else CONFIDENCE_MARKER_TABLE_UNCAPTIONED,
            "extractionMethod": EXTRACTION_METHOD_MARKER,
        })
        index += 1

    return tables


def extract_sections_from_markdown(markdown_text: str) -> List[Dict[str, Any]]:
    """Extract document sections from Marker's markdown output."""
    sections: List[Dict[str, Any]] = []
    current: Optional[Dict[str, Any]] = None
    page_counter = 1

    for line in markdown_text.split("\n"):
        heading_match = re.match(r"^#{1,4}\s+(.+)$", line)
        if heading_match:
            title = normalize_text(heading_match.group(1))
            if not title or len(title) > 90:
                continue
            if LOW_VALUE_SECTION_TITLE_RE.match(title):
                if re.match(r"^(?:references?|bibliography)$", title, re.IGNORECASE):
                    if current:
                        sections.append(current)
                    return sections[:12]
                continue

            if current:
                sections.append(current)
            current = {
                "sourceSectionTitle": title,
                "editorialTitle": title,
                "paragraphs": [],
                "pageStart": page_counter,
                "pageEnd": page_counter,
            }
            continue

        if current is None:
            current = {
                "sourceSectionTitle": "Introduction",
                "editorialTitle": "Introduction",
                "paragraphs": [],
                "pageStart": page_counter,
                "pageEnd": page_counter,
            }

        text = normalize_text(line)
        if text and not looks_like_low_value_text(text):
            if not current["paragraphs"] or current["paragraphs"][-1] != text:
                current["paragraphs"].append(text)
                current["pageEnd"] = page_counter

    if current:
        sections.append(current)

    return sections[:12]


def extract_figures_from_marker_images(
    images_dict: Dict[str, Any],
    paper_output_dir: Path,
    images_dir: Path,
) -> List[Dict[str, Any]]:
    """Extract figures from Marker's image output."""
    figures: List[Dict[str, Any]] = []
    index = 1

    images_dir.mkdir(parents=True, exist_ok=True)

    for image_key, image_data in images_dict.items():
        filename = f"marker_figure_{index}.png"
        target_path = images_dir / filename

        try:
            if hasattr(image_data, "save"):
                image_data.save(str(target_path), format="PNG")
                width = image_data.width
                height = image_data.height
            elif isinstance(image_data, str) and os.path.exists(image_data):
                import shutil
                shutil.copy2(image_data, str(target_path))
                if Image is not None:
                    with Image.open(target_path) as img:
                        width, height = img.size
                else:
                    width, height = 0, 0
            elif isinstance(image_data, bytes):
                with open(target_path, "wb") as f:
                    f.write(image_data)
                if Image is not None:
                    with Image.open(target_path) as img:
                        width, height = img.size
                else:
                    width, height = 0, 0
            else:
                continue
        except Exception:
            continue

        caption = f"Figure {index}"
        has_caption = False
        if isinstance(image_key, str):
            caption_match = FIGURE_CAPTION_RE.match(image_key)
            if caption_match:
                caption = image_key
                has_caption = True

        figures.append({
            "id": f"figure_marker_{index}",
            "number": index,
            "caption": caption,
            "page": 0,
            "path": str(target_path.relative_to(paper_output_dir)),
            "filename": filename,
            "width": width,
            "height": height,
            "bbox": None,
            "confidence": CONFIDENCE_MARKER_FIGURE_CAPTIONED if has_caption else CONFIDENCE_MARKER_FIGURE_UNCAPTIONED,
            "extractionMethod": EXTRACTION_METHOD_MARKER,
        })
        index += 1

    return figures


def extract_with_pymupdf(
    pdf_path: str,
    output_dir: str,
    paper_id: str,
    paper_title: str,
) -> Dict[str, Any]:
    """Extract PDF content using PyMuPDF with optional DocLayout-YOLO enhancement."""
    pdf_path_obj = Path(pdf_path)
    output_root = Path(output_dir)

    paper_output_dir = output_root / paper_id
    paper_output_dir.mkdir(parents=True, exist_ok=True)
    images_dir = paper_output_dir / "images"
    images_dir.mkdir(exist_ok=True)
    formulas_dir = paper_output_dir / "formula-crops"
    formulas_dir.mkdir(exist_ok=True)
    # Directory for page images (for VLM fallback analysis)
    pages_dir = paper_output_dir / "pages"
    pages_dir.mkdir(exist_ok=True)

    try:
        doc = fitz.open(str(pdf_path_obj))

        result: Dict[str, Any] = {
            "paperId": paper_id,
            "paperTitle": paper_title,
            "pageCount": len(doc),
            "metadata": {
                "title": doc.metadata.get("title", ""),
                "author": doc.metadata.get("author", ""),
                "subject": doc.metadata.get("subject", ""),
                "creator": doc.metadata.get("creator", ""),
                "producer": doc.metadata.get("producer", ""),
            },
            "pages": [],
            "figures": [],
            "tables": [],
            "formulas": [],
            "sections": [],
            "markdown": "",
            "fullText": "",
            "extractionMethod": EXTRACTION_METHOD_PYMUPDF,
        }

        page_layouts: List[Dict[str, Any]] = []

        for page_num in range(len(doc)):
            page = doc[page_num]
            layout = extract_text_layout(page)
            page_layouts.append({"pageNumber": page_num + 1, **layout})

            # Optional: Use DocLayout-YOLO for layout analysis
            doclayout_regions: Optional[List[Dict[str, Any]]] = None
            if DOCLAYOUT_YOLO_AVAILABLE:
                try:
                    doclayout_regions = detect_layout_regions_with_doclayout(page, page_num)
                except Exception:
                    doclayout_regions = None

            figures = extract_figures_from_page(
                page, page_num, paper_output_dir, images_dir, layout, doclayout_regions
            )
            tables = extract_tables_from_page(page, page_num, layout)
            formulas = extract_formulas_from_page_with_crops(
                page,
                layout,
                page_num,
                paper_output_dir,
                formulas_dir,
                doclayout_regions,
            )

            result["figures"].extend(figures)
            result["tables"].extend(tables)
            result["formulas"].extend(formulas)
            result["pages"].append(
                {
                    "pageNumber": page_num + 1,
                    "text": layout["full_text"],
                    "blocks": layout["blocks"][:80],
                }
            )
            result["fullText"] += layout["full_text"] + "\n"

            # Render page image for VLM fallback analysis when:
            # 1. No figures detected on this page
            # 2. Low confidence figures detected
            avg_figure_confidence = 0.0
            if figures:
                avg_figure_confidence = sum(f.get("confidence", 0) for f in figures) / len(figures)

            if len(figures) == 0 or avg_figure_confidence < 0.6:
                try:
                    page_image_path = pages_dir / f"page_{page_num + 1}.png"
                    pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
                    save_pixmap_png(pix, page_image_path)

                    # Add page image info to result for VLM analysis
                    if "pageImages" not in result:
                        result["pageImages"] = []
                    result["pageImages"].append({
                        "pageNumber": page_num + 1,
                        "path": str(page_image_path.relative_to(paper_output_dir)),
                        "reason": "no_figures" if len(figures) == 0 else "low_confidence",
                        "figureCount": len(figures),
                        "avgConfidence": round(avg_figure_confidence, 2) if figures else 0,
                    })
                except Exception as e:
                    # Non-fatal: page image rendering failed
                    pass

        sections = build_document_sections(page_layouts)
        result["sections"] = sections

        # Detect figure groups (组图)
        result["figureGroups"] = detect_figure_groups(result["figures"])

        # Extract LaTeX equation blocks from text and merge with heuristic formulas
        latex_block_formulas = extract_latex_equation_blocks_from_text(
            result["fullText"],
            result["pages"],
        )
        if latex_block_formulas:
            result["formulas"] = merge_formula_sources(
                result["formulas"],
                latex_block_formulas,
            )

        abstract_section = next(
            (
                section
                for section in sections
                if normalize_section_title(section.get("sourceSectionTitle", "")) == "Abstract"
            ),
            None,
        )
        if abstract_section:
            result["abstract"] = normalize_multiline_text("\n\n".join(abstract_section.get("paragraphs", [])[:3]))
        else:
            result["abstract"] = normalize_text(result["fullText"][:1200])

        result["markdown"] = build_markdown_document(
            paper_title=paper_title,
            sections=sections,
            figures=result["figures"],
            tables=result["tables"],
            formulas=result["formulas"],
        )

        doc.close()
        return result

    except Exception as error:
        return {"error": f"PDF extraction failed: {error}"}


def main() -> None:
    """Main entry point for PDF extraction.

    Usage:
        python pdf_extract.py <pdf_path> <output_dir> <paper_id> <paper_title> [--method=auto|marker|pymupdf]

    The --method flag controls extraction strategy:
        - auto (default): Try Marker first, fall back to PyMuPDF
        - marker: Use Marker only (exit with code 2 if unavailable)
        - pymupdf: Use PyMuPDF only (skip Marker)
    """
    args = sys.argv[1:]

    # Parse method flag
    prefer_marker = True
    method = "auto"
    filtered_args = []
    for arg in args:
        if arg.startswith("--method="):
            method = arg.split("=", 1)[1].lower()
            if method == "pymupdf":
                prefer_marker = False
            elif method == "marker":
                prefer_marker = True
                if not MARKER_AVAILABLE:
                    emit_json({
                        "error": "marker_not_available",
                        "markerImportError": MARKER_IMPORT_ERROR,
                        "hint": "Install Marker: pip install marker-pdf",
                    })
                    sys.exit(2)
        else:
            filtered_args.append(arg)

    if len(filtered_args) < 4:
        emit_json({"error": "Usage: python pdf_extract.py <pdf_path> <output_dir> <paper_id> <paper_title> [--method=auto|marker|pymupdf]"})
        sys.exit(1)

    pdf_path = filtered_args[0]
    output_dir = filtered_args[1]
    paper_id = filtered_args[2]
    paper_title = filtered_args[3]

    result = extract_pdf_content(pdf_path, output_dir, paper_id, paper_title, prefer_marker=prefer_marker)

    # Add extraction method info to result
    if "error" not in result:
        result["requestedMethod"] = method
        result["markerAvailable"] = MARKER_AVAILABLE
        result["doclayoutYoloAvailable"] = DOCLAYOUT_YOLO_AVAILABLE

    emit_json(result)


if __name__ == "__main__":
    main()
