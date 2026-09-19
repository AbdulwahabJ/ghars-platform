from pathlib import Path

import pymupdf
from PIL import Image, ImageDraw


PDF_DIR = Path(".agents/outputs/ghars-pdf-qa")
IMAGE_DIR = PDF_DIR / "rendered"
IMAGE_DIR.mkdir(parents=True, exist_ok=True)

tiles: list[tuple[str, Image.Image]] = []
for pdf_path in sorted(PDF_DIR.glob("*.pdf")):
    document = pymupdf.open(pdf_path)
    page_indexes = sorted({0, max(0, document.page_count - 1)})
    for page_index in page_indexes:
        page = document[page_index]
        pixmap = page.get_pixmap(matrix=pymupdf.Matrix(1.5, 1.5), alpha=False)
        image_path = IMAGE_DIR / f"{pdf_path.stem}-page-{page_index + 1}.png"
        pixmap.save(image_path)
        image = Image.open(image_path).convert("RGB")
        image.thumbnail((420, 560))
        tiles.append((f"{pdf_path.stem} — page {page_index + 1}/{document.page_count}", image.copy()))
    document.close()

columns = 3
tile_width = 450
tile_height = 610
rows = (len(tiles) + columns - 1) // columns
contact_sheet = Image.new("RGB", (columns * tile_width, rows * tile_height), "white")
draw = ImageDraw.Draw(contact_sheet)
for index, (label, image) in enumerate(tiles):
    x = (index % columns) * tile_width
    y = (index // columns) * tile_height
    draw.text((x + 10, y + 8), label, fill="black")
    contact_sheet.paste(image, (x + 10, y + 35))

contact_sheet.save(PDF_DIR / "contact-sheet.png")
print(PDF_DIR / "contact-sheet.png")