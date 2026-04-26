#!/usr/bin/env python3
"""
Marker-based PDF extraction wrapper for high-accuracy extraction.

Uses the Marker library (https://github.com/datalab-to/marker) as the primary
extraction engine. Marker achieves ~96.67% accuracy by combining:
- DocLayout-YOLO for layout analysis (figure/table/formula region detection)
- Nougat/Surya for OCR and formula recognition
- Structured table extraction with header/body separation

This script produces the SAME JSON schema as pdf_extract.py so the TypeScript
layer can consume either output transparently.

If Marker is not installed, this script exits with a specific error code (2)
so the caller can fall back to PyMuPDF extraction gracefully.
"""

from __future__ import annotations

import json
import os
import re
import sys
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

# ---------------------------------------------------------------------------
# Marker availability check
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
# PyMuPDF (optional, for image rendering fallback)
# ---------------------------------------------------------------------------
try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from PIL import Image
except ImportError:
    Image = None

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
FIGURE_CAPTION_RE = re.compile(r"^(?:fig(?:ure)?\.?\s*\d+|图\s*\d+)\b", re.IGNORECASE)
TABLE_CAPTION_RE = re.compile(r"^(?:table\s*\d+|表\s*\d+)\b", re.IGNORECASE)
SECTION_TITLE_HINT_RE = re.compile(
    r"^(?:\d+(?:\.\d+)*\s+)?(?:abstract|introduction|background|related work|preliminar(?:y|ies)|"
    r"problem|task|method|methods|approach|model|architecture|training|evaluation|experiments?|"
    r"results?|discussion|analysis|ablation|limitations?|conclusion|references?|appendix)\b",
    re.IGNORECASE,
)
LOW_VALUE_SECTION_TITLE_RE = re.compile(
    r"^(?:references?|bibliography|appendix|table of contents|contents|"
    r"list of figures|list of tables|acknowledg(?:e)?ments?|declaration|dedication|copyright)$",
    re.IGNORECASE,
)
LOW_VALUE_TEXT_RE = re.compile(
    r"(?:table of contents|list of figures|list of tables|acknowledg(?:e)?ments?|"
    r"personal use is permitted|all rights reserved|ieee xplore|cookie|privacy notice|"
    r"sign in|institutional access|purchase pdf|download pdf|submitted in partial fulfillment|"
    r"doctor of philosophy|master of science)",
    re.IGNORECASE,
)

# Confidence scores by extraction method
CONFIDENCE_MARKER_FORMULA = 0.96
CONFIDENCE_MARKER_FIGURE_CAPTIONED = 0.95
CONFIDENCE_MARKER_FIGURE_UNCAPTIONED = 0.88
CONFIDENCE_MARKER_TABLE_CAPTIONED = 0.96
CONFIDENCE_MARKER_TABLE_UNCAPTIONED = 0.90
CONFIDENCE_MARKER_SECTION = 0.93


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
    if LOW_VALUE_TEXT_RE.search(text):
        return True
    if re.fullmatch(r"\d{1,4}", text):
        return True
    return False


# ---------------------------------------------------------------------------
# Markdown parsing helpers — extract structured data from Marker's markdown
# ---------------------------------------------------------------------------

def extract_latex_formulas(markdown_text: str) -> List[Dict[str, Any]]:
    """Extract display-mode LaTeX formulas from Marker's markdown output.

    Marker renders formulas as $$...$$ (display) or $...$ (inline).
    We extract display formulas as high-confidence entries.
    """
    formulas: List[Dict[str, Any]] = []
    seen: set[str] = set()
    index = 1

    # Display math: $$...$$
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
            "page": 0,  # Marker doesn't provide page numbers per formula
            "type": "display",
            "latex": latex,
            "raw": latex,
            "bbox": None,
            "path": None,
            "confidence": CONFIDENCE_MARKER_FORMULA,
            "extractionMethod": "marker",
        })
        index += 1

    return formulas


def extract_tables_from_markdown(markdown_text: str) -> List[Dict[str, Any]]:
    """Extract tables from Marker's markdown output.

    Marker renders tables as markdown tables with | delimiters.
    """
    tables: List[Dict[str, Any]] = []
    index = 1

    # Match markdown tables: header | separator | rows
    table_pattern = re.compile(
        r"((?:^\|[^\n]+\|\n)+)", re.MULTILINE
    )

    for match in table_pattern.finditer(markdown_text):
        table_text = match.group(1).strip()
        lines = [line.strip() for line in table_text.split("\n") if line.strip()]
        if len(lines) < 2:
            continue

        # Parse header
        header_cells = [cell.strip() for cell in lines[0].strip("|").split("|")]

        # Skip separator line (---|---|---)
        data_lines = []
        for line in lines[1:]:
            if re.match(r"^\|[\s\-:|]+\|$", line):
                continue
            data_lines.append(line)

        if not data_lines and len(lines) >= 2:
            # If all remaining lines are separators, skip
            continue

        # Parse data rows
        rows: List[Dict[str, str]] = []
        for line in data_lines:
            cells = [cell.strip() for cell in line.strip("|").split("|")]
            row_dict = {}
            for col_idx, cell in enumerate(cells):
                header = header_cells[col_idx] if col_idx < len(header_cells) else f"Column {col_idx + 1}"
                row_dict[header] = cell
            rows.append(row_dict)

        # Check for caption before the table
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
            "extractionMethod": "marker",
        })
        index += 1

    return tables


def extract_sections_from_markdown(markdown_text: str) -> List[Dict[str, Any]]:
    """Extract document sections from Marker's markdown output.

    Sections are identified by ## headings.
    """
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
    """Extract figures from Marker's image output.

    Marker returns images as a dict of filename -> PIL Image or path.
    We save them and create figure entries with high confidence.
    """
    figures: List[Dict[str, Any]] = []
    index = 1

    images_dir.mkdir(parents=True, exist_ok=True)

    for image_key, image_data in images_dict.items():
        filename = f"marker_figure_{index}.png"
        target_path = images_dir / filename

        try:
            if hasattr(image_data, "save"):
                # PIL Image
                image_data.save(str(target_path), format="PNG")
                width = image_data.width
                height = image_data.height
            elif isinstance(image_data, str) and os.path.exists(image_data):
                # File path
                import shutil
                shutil.copy2(image_data, str(target_path))
                if Image is not None:
                    with Image.open(target_path) as img:
                        width, height = img.size
                else:
                    width, height = 0, 0
            elif isinstance(image_data, bytes):
                # Raw bytes
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

        # Try to find caption from the image key
        caption = f"Figure {index}"
        has_caption = False
        if isinstance(image_key, str):
            # Marker sometimes embeds caption info in the key
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
            "extractionMethod": "marker",
        })
        index += 1

    return figures


# ---------------------------------------------------------------------------
# Main Marker extraction
# ---------------------------------------------------------------------------

def extract_with_marker(
    pdf_path: str,
    output_dir: str,
    paper_id: str,
    paper_title: str,
) -> Dict[str, Any]:
    """Extract PDF content using Marker library.

    Returns the same JSON schema as pdf_extract.py for backward compatibility.
    """
    if not MARKER_AVAILABLE:
        return {
            "error": "marker_not_available",
            "markerImportError": MARKER_IMPORT_ERROR,
        }

    pdf_path_obj = Path(pdf_path)
    output_root = Path(output_dir)

    if not pdf_path_obj.exists():
        return {"error": f"PDF file not found: {pdf_path_obj}"}

    paper_output_dir = output_root / paper_id
    paper_output_dir.mkdir(parents=True, exist_ok=True)
    images_dir = paper_output_dir / "images"
    images_dir.mkdir(exist_ok=True)
    formulas_dir = paper_output_dir / "formula-crops"
    formulas_dir.mkdir(exist_ok=True)

    try:
        # Initialize Marker converter
        config_parser = ConfigParser({})
        model_dict = create_model_dict()
        converter = PdfConverter(
            config=config_parser.generate_config(),
            artifact_dict=model_dict,
        )

        # Run conversion
        rendered = converter(str(pdf_path_obj))
        markdown_text, metadata, images = text_from_rendered(rendered)

        # Extract structured data from Marker's output
        formulas = extract_latex_formulas(markdown_text)
        tables = extract_tables_from_markdown(markdown_text)
        sections = extract_sections_from_markdown(markdown_text)
        figures = extract_figures_from_marker_images(images, paper_output_dir, images_dir)

        # Try to get page count from PyMuPDF if available
        page_count = 0
        full_text = markdown_text
        pages: List[Dict[str, Any]] = []

        if fitz is not None:
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
                # Estimate page count from markdown length
                page_count = max(1, len(markdown_text) // 3000)
        else:
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

        # Build markdown document (use Marker's output directly — it's already high quality)
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
            "markdown": normalize_multiline_text(markdown_text),
            "fullText": full_text or markdown_text,
            "abstract": abstract,
            "extractionMethod": "marker",
        }

        return result

    except Exception as error:
        return {"error": f"Marker extraction failed: {error}"}


def main() -> None:
    if not MARKER_AVAILABLE:
        emit_json({
            "error": "marker_not_available",
            "markerImportError": MARKER_IMPORT_ERROR,
            "hint": "Install Marker: pip install marker-pdf",
        })
        sys.exit(2)

    if len(sys.argv) < 5:
        emit_json({"error": "Usage: python marker_extract.py <pdf_path> <output_dir> <paper_id> <paper_title>"})
        sys.exit(1)

    pdf_path = sys.argv[1]
    output_dir = sys.argv[2]
    paper_id = sys.argv[3]
    paper_title = sys.argv[4]

    result = extract_with_marker(pdf_path, output_dir, paper_id, paper_title)

    if result.get("error") == "marker_not_available":
        sys.exit(2)

    emit_json(result)


if __name__ == "__main__":
    main()
