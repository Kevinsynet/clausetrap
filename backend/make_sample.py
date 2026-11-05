from pathlib import Path
import fitz
root = Path(__file__).resolve().parents[1]
lines = (root/'data/sample-contract.txt').read_text().splitlines()
doc = fitz.open()
for group in (lines[:18], lines[18:]):
    page = doc.new_page()
    y = 55
    for line in group:
        box = fitz.Rect(45, y, 550, y + 65)
        page.insert_textbox(box, line, fontsize=11, fontname='helv')
        y += 24 if len(line) < 75 else 40
    page.insert_text((45, 800), f'ClauseTrap demonstration | Page {len(doc)}', fontsize=9)
doc.save(root/'data/sample-contract.pdf')
