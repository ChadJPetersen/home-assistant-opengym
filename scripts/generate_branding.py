#!/usr/bin/env python3
"""Reproduce Home Assistant icon and logo from openGym's official barbell glyph.

Official SVG: https://github.com/DuarteSantos8/openGym/blob/main/frontend/resources/icon.svg
Usage: python -m pip install Pillow
       python scripts/generate_branding.py

The glyph uses the five exact rectangles and two official colors from upstream.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

DEST = Path(__file__).resolve().parents[1] / "opengym"
INK = (12, 14, 18, 255)
LIME = (163, 230, 53, 255)
WHITE = (244, 245, 247, 255)
RECTS = ((80, 242, 432, 270), (80, 199, 116, 313),
         (131, 169, 178, 343), (334, 169, 381, 343),
         (396, 199, 432, 313))


def glyph(size: int) -> Image.Image:
    oversample = 4
    canvas = Image.new("RGBA", (512 * oversample, 512 * oversample), INK)
    drawer = ImageDraw.Draw(canvas)
    for rect in RECTS:
        drawer.rectangle(tuple(n * oversample for n in rect), fill=LIME)
    return canvas.resize((size, size), Image.Resampling.LANCZOS)


def logo() -> Image.Image:
    scale = 3
    canvas = Image.new("RGBA", (250 * scale, 100 * scale), INK)
    canvas.alpha_composite(glyph(100 * scale), (0, 0))
    drawer = ImageDraw.Draw(canvas)
    label = "openGym"
    font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
    font = ImageFont.truetype(font_path, 24 * scale)
    bbox = drawer.textbbox((0, 0), label, font=font)
    if bbox[2] - bbox[0] > 157 * scale:
        font = ImageFont.truetype(font_path, 21 * scale)
        bbox = drawer.textbbox((0, 0), label, font=font)
    top = (100 * scale - (bbox[3] - bbox[1])) // 2 - bbox[1]
    drawer.text((93 * scale, top), label, font=font, fill=WHITE)
    return canvas.resize((250, 100), Image.Resampling.LANCZOS)


def save_validated(name: str, artwork: Image.Image, size: tuple[int, int]) -> None:
    path = DEST / name
    artwork.convert("RGB").quantize(
        colors=48, dither=Image.Dither.NONE
    ).save(path, format="PNG", optimize=True)
    with Image.open(path) as result:
        result.verify()
    with Image.open(path) as result:
        result.load()
        assert result.format == "PNG" and result.size == size
    print(f"{path}: {size}, valid PNG")


if __name__ == "__main__":
    DEST.mkdir(parents=True, exist_ok=True)
    save_validated("icon.png", glyph(128), (128, 128))
    save_validated("logo.png", logo(), (250, 100))
