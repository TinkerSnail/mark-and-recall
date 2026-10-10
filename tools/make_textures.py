#!/usr/bin/env python3
"""Build textures/ from your own Morrowind install.

Prefers the Intelligent Textures upscales and falls back to the vanilla files.
The output is Bethesda's art, so it stays out of git (pinchy-field.jpg, a crop
of your own screenshot, is the exception).
"""

import os

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MW = "/Users/christina/Dropbox/Mac/Documents/Morrowind"
SEARCH = [
    f"{MW}/morrowmods/Intelligent Textures-47469-2-0-1671912841 (1)/00 Core/textures",
    f"{MW}/extracted/Data Files/Textures",
]
PINCHY_SHOT = f"{MW}/morrowmods/PetMudcrab/docs/pinchy.png"
OUT = os.path.join(ROOT, "textures")


def find(stem):
    """Case-insensitive lookup across the texture folders, upscales first."""
    for d in SEARCH:
        if not os.path.isdir(d):
            continue
        for f in os.listdir(d):
            base, ext = os.path.splitext(f)
            if base.lower() == stem.lower() and ext.lower() in (".dds", ".tga", ".bmp"):
                return os.path.join(d, f)
    raise SystemExit(f"can't find texture {stem!r} in {SEARCH}")


def parchment():
    """Journal page grain from Tx_menubook, flattened and made seamless."""
    mb = Image.open(find("Tx_menubook")).convert("RGB")
    s = mb.width / 2048  # crop box below was measured on the 2048-wide upscale
    a = mb.crop(tuple(int(v * s) for v in (300, 140, 940, 780)))  # inside the left page, clear of spine and edge
    w, h = a.size
    low = a.filter(ImageFilter.GaussianBlur(48 * s))
    mean = np.array([int(v) for v in ImageStat.Stat(a).mean])
    # keep the grain, drop big stains so opposite edges agree
    detail = np.clip(np.asarray(a).astype(np.int16) - np.asarray(low).astype(np.int16) + mean, 0, 255)
    a2 = Image.fromarray(detail.astype(np.uint8))
    b = ImageChops.offset(a2, w // 2, h // 2)  # edges now wrap; the seam moves to the middle
    m = Image.new("L", (w, h), 0)
    pad = int(w * 0.12)
    ImageDraw.Draw(m).rectangle((pad, pad, w - pad, h - pad), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(w * 0.08))
    t = Image.composite(a2, b, m)
    # a whisper of the original mottling, from a seamless blurred copy
    mott = Image.composite(low, ImageChops.offset(low, w // 2, h // 2), m).filter(ImageFilter.GaussianBlur(30 * s))
    t = Image.blend(t, ImageChops.multiply(t, mott.point(lambda v: min(255, int(v * 1.25)))), 0.25)
    t.resize((640, 640), Image.LANCZOS).save(f"{OUT}/parchment.jpg", quality=84, optimize=True)


def main():
    os.makedirs(OUT, exist_ok=True)
    parchment()
    scroll = Image.open(find("scroll")).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    scroll.save(f"{OUT}/scroll-v.webp", quality=82, method=6)  # style.css slices assume 1024x1024
    scroll.rotate(-90, expand=True).save(f"{OUT}/scroll-h.webp", quality=82, method=6)
    Image.open(find("Tx_parchment_03")).convert("RGB").resize((256, 256), Image.LANCZOS).save(f"{OUT}/fiber.jpg", quality=85)
    Image.open(find("menu_head_block_middle")).convert("RGB").save(f"{OUT}/trim.png", optimize=True)
    if os.path.exists(PINCHY_SHOT):
        shot = Image.open(PINCHY_SHOT).convert("RGB").crop((330, 130, 1030, 800))  # Pinchy and her Telvanni
        shot.resize((420, round(420 * shot.height / shot.width)), Image.LANCZOS).save(
            f"{OUT}/pinchy-field.jpg", quality=84, optimize=True)
    for f in sorted(os.listdir(OUT)):
        print(f"{f:20} {os.path.getsize(os.path.join(OUT, f)) // 1024:5} KB")


if __name__ == "__main__":
    main()
