from __future__ import annotations

import argparse
from pathlib import Path

import fitz


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--page", type=int, default=0)
    parser.add_argument("--mode", choices=["page", "auto-cover"], default="page")
    args = parser.parse_args()

    source = Path(args.input)
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(source)
    try:
        if args.mode == "auto-cover":
            if try_extract_largest_image(doc, output):
                print("embedded-image")
                return
            render_page(doc, output, args.page)
            print("page-render")
            return

        render_page(doc, output, args.page)
        print("page-render")
    finally:
        doc.close()


def try_extract_largest_image(doc: fitz.Document, output: Path) -> bool:
    best_xref: int | None = None
    best_area = 0

    for page_index in range(min(5, len(doc))):
        page = doc.load_page(page_index)
        for image in page.get_images(full=True):
            xref = image[0]
            try:
                pix = fitz.Pixmap(doc, xref)
            except RuntimeError:
                continue

            width = pix.width
            height = pix.height
            area = width * height

            if area > best_area:
                best_area = area
                best_xref = xref

            pix = None

    if best_xref is None:
        return False

    pix = fitz.Pixmap(doc, best_xref)
    try:
        pix = ensure_rgb_pixmap(pix)
        pix.save(output)
    finally:
        pix = None
    return True


def render_page(doc: fitz.Document, output: Path, page_index: int) -> None:
    safe_index = min(max(page_index, 0), len(doc) - 1)
    page = doc.load_page(safe_index)
    pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0), alpha=False)
    pix = ensure_rgb_pixmap(pix)
    pix.save(output)


def ensure_rgb_pixmap(pix: fitz.Pixmap) -> fitz.Pixmap:
    if pix.colorspace is None:
        return fitz.Pixmap(fitz.csRGB, pix)
    if pix.colorspace.n != 3 or pix.alpha:
        return fitz.Pixmap(fitz.csRGB, pix)
    return pix


if __name__ == "__main__":
    main()
