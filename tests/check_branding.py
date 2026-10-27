#!/usr/bin/env python3
"""Fail CI if Home Assistant branding images are malformed or unreadable."""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1] / "opengym"
for name, size in (("icon.png", (128, 128)), ("logo.png", (250, 100))):
    path = ROOT / name
    assert path.is_file(), f"Missing required Home Assistant app asset: {path}"
    with Image.open(path) as image:
        image.verify()  # Checks PNG chunk integrity (CRC, IEND)
    with Image.open(path) as image:
        image.load()    # Checks actual compressed pixel contents
        assert image.format == "PNG", f"{name} is not a PNG"
        assert image.size == size, f"{name} should be {size}; got {image.size}"
        assert image.convert("RGB").getextrema() != ((0, 0),) * 3, f"{name} is blank"
    print(f"OK {name}: {size}, {path.stat().st_size} bytes")
