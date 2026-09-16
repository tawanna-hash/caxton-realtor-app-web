"""Add AcroForm widgets to official TREC PDFs published without embedded fields.

The official page artwork and wording are left untouched. Text inputs are placed
over printed blank rules, and checkboxes are placed over printed checkbox glyphs.
"""

from pathlib import Path

import pymupdf


ROOT = Path(__file__).resolve().parents[1]
FORM_DIR = ROOT / "public" / "forms" / "trec-library"
FORM_NAMES = ("trec-9-18.pdf", "trec-24-20.pdf", "trec-30-18.pdf", "trec-61-0.pdf")


def add_widgets(pdf_path: Path) -> None:
    source = pymupdf.open(pdf_path)
    output = pymupdf.open()
    output.insert_pdf(source)
    field_count = 0

    for page_index, (source_page, output_page) in enumerate(zip(source, output), start=1):
        text_lines: list[pymupdf.Rect] = []
        for drawing in source_page.get_drawings():
            rect = drawing["rect"]
            if (
                18 <= rect.width <= 505
                and rect.height < 2
                and 48 <= rect.y0 <= source_page.rect.height - 30
            ):
                candidate = pymupdf.Rect(rect.x0, max(0, rect.y0 - 12), rect.x1, rect.y0 + 2)
                if not any(candidate.intersects(existing) and abs(candidate.y0 - existing.y0) < 2 for existing in text_lines):
                    text_lines.append(candidate)

        for index, rect in enumerate(text_lines, start=1):
            widget = pymupdf.Widget()
            widget.field_name = f"auto_p{page_index:02d}_text_{index:03d}"
            widget.field_type = pymupdf.PDF_WIDGET_TYPE_TEXT
            widget.field_value = ""
            widget.field_label = "Fillable line"
            widget.rect = rect
            widget.field_flags = 0
            widget.text_fontsize = 8
            widget.field_flags = 0
            widget.border_width = 0
            widget.fill_color = None
            output_page.add_widget(widget)
            field_count += 1

        checkbox_words = [word for word in source_page.get_text("words") if word[4] == "q"]
        for index, word in enumerate(checkbox_words, start=1):
            widget = pymupdf.Widget()
            widget.field_name = f"auto_p{page_index:02d}_check_{index:03d}"
            widget.field_type = pymupdf.PDF_WIDGET_TYPE_CHECKBOX
            widget.field_value = False
            widget.field_label = "Checkbox"
            widget.rect = pymupdf.Rect(word[0], word[1], word[2], word[3])
            widget.border_width = 0
            widget.fill_color = None
            output_page.add_widget(widget)
            field_count += 1

    temporary_path = pdf_path.with_suffix(".fillable.pdf")
    output.save(temporary_path, garbage=4, deflate=True)
    output.close()
    source.close()
    temporary_path.replace(pdf_path)
    print(f"{pdf_path.name}: added {field_count} live controls")


for form_name in FORM_NAMES:
    add_widgets(FORM_DIR / form_name)
