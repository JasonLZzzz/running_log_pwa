"""Optional icon regeneration with Python + Pillow; not needed to build or run."""
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parent.parent / "public" / "icons"
for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("maskable-512.png", 512), ("apple-touch-icon.png", 180)]:
    scale = 4
    image = Image.new("RGB", (512 * scale, 512 * scale), "#1d5b48")
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(tuple(v * scale for v in (150, 118, 362, 394)), radius=24 * scale, fill="#f5f6f2")
    for points in [[(200, 191), (312, 191)], [(200, 239), (312, 239)], [(202, 303), (234, 335), (302, 267)]]:
        draw.line([(x * scale, y * scale) for x, y in points], fill="#1d5b48", width=20 * scale, joint="curve")
        for x, y in points:
            draw.ellipse(((x - 10) * scale, (y - 10) * scale, (x + 10) * scale, (y + 10) * scale), fill="#1d5b48")
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / name)
