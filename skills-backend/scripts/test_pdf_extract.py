from __future__ import annotations

import importlib.util
import unittest
from pathlib import Path


def load_pdf_extract_module():
    script_path = Path(__file__).with_name("pdf_extract.py")
    spec = importlib.util.spec_from_file_location("pdf_extract_module", script_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load module from {script_path}")

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


pdf_extract = load_pdf_extract_module()


class BuildMarkdownDocumentTests(unittest.TestCase):
    def test_interleaves_assets_with_section_page_ranges(self):
        markdown = pdf_extract.build_markdown_document(
            paper_title="Structured Paper",
            sections=[
                {
                    "sourceSectionTitle": "Introduction",
                    "editorialTitle": "Introduction",
                    "paragraphs": ["Opening context for the paper."],
                    "pageStart": 1,
                    "pageEnd": 1,
                },
                {
                    "sourceSectionTitle": "Method",
                    "editorialTitle": "Method",
                    "paragraphs": ["Method details for the second page."],
                    "pageStart": 2,
                    "pageEnd": 2,
                },
            ],
            figures=[
                {
                    "id": "figure_1_1",
                    "number": 1,
                    "caption": "Figure 1. Overview pipeline",
                    "page": 1,
                    "path": "images/page_1_figure_1.png",
                    "bbox": [40, 180, 460, 420],
                }
            ],
            tables=[
                {
                    "id": "table_2_1",
                    "number": 1,
                    "caption": "Table 1. Metrics",
                    "page": 2,
                    "headers": ["Method", "Score"],
                    "rows": [{"Method": "Ours", "Score": "0.91"}],
                    "rawText": "",
                    "bbox": [44, 210, 460, 320],
                }
            ],
            formulas=[
                {
                    "id": "formula_2_1",
                    "number": "1",
                    "latex": "J(\\theta)=\\mathbb{E}[r_t]",
                    "raw": "J(theta)=E[r_t]",
                    "page": 2,
                    "bbox": [44, 340, 260, 372],
                }
            ],
        )

        self.assertNotIn("## Figures", markdown)
        self.assertNotIn("## Tables", markdown)
        self.assertNotIn("## Formulas", markdown)
        self.assertNotIn("## Evidence Appendix", markdown)

        intro_text_index = markdown.index("Opening context for the paper.")
        figure_index = markdown.index("![Figure 1. Overview pipeline](images/page_1_figure_1.png)")
        method_heading_index = markdown.index("## Method")
        table_index = markdown.index("**Table 1. Metrics**")
        formula_index = markdown.index("**Formula 1**")

        self.assertLess(intro_text_index, figure_index)
        self.assertLess(figure_index, method_heading_index)
        self.assertLess(method_heading_index, table_index)
        self.assertLess(table_index, formula_index)

    def test_assets_snap_to_nearest_section_when_page_range_is_sparse(self):
        markdown = pdf_extract.build_markdown_document(
            paper_title="Sparse Sections Paper",
            sections=[
                {
                    "sourceSectionTitle": "Introduction",
                    "editorialTitle": "Introduction",
                    "paragraphs": ["Only one section is available."],
                    "pageStart": 1,
                    "pageEnd": 1,
                }
            ],
            figures=[
                {
                    "id": "figure_5_1",
                    "number": 5,
                    "caption": "Figure 5. Deferred evidence",
                    "page": 5,
                    "path": "images/page_5_figure_5.png",
                    "bbox": [40, 90, 420, 260],
                }
            ],
            tables=[],
            formulas=[],
        )

        figure_index = markdown.index("![Figure 5. Deferred evidence](images/page_5_figure_5.png)")
        section_index = markdown.index("Only one section is available.")
        self.assertLess(section_index, figure_index)
        self.assertNotIn("## Evidence Appendix", markdown)

    def test_assets_fall_back_to_appendix_when_there_are_no_sections(self):
        markdown = pdf_extract.build_markdown_document(
            paper_title="Appendix Only Paper",
            sections=[],
            figures=[
                {
                    "id": "figure_1_1",
                    "number": 1,
                    "caption": "Figure 1. Detached evidence",
                    "page": 1,
                    "path": "images/page_1_figure_1.png",
                    "bbox": [40, 90, 420, 260],
                }
            ],
            tables=[],
            formulas=[],
        )

        appendix_index = markdown.index("## Evidence Appendix")
        figure_index = markdown.index("![Figure 1. Detached evidence](images/page_1_figure_1.png)")
        self.assertLess(appendix_index, figure_index)


if __name__ == "__main__":
    unittest.main()
