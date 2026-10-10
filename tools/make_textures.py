#!/usr/bin/env python3
"""Build textures/ from your own Morrowind install.

Prefers the Intelligent Textures upscales and falls back to the vanilla files.
The output is Bethesda's art, so it stays out of git (pinchy-field.jpg, a crop
of your own screenshot, is the exception). The glyph cutouts need ImageMagick
(`magick`) for its connected-components filter.
"""

import os
import subprocess
import tempfile

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageOps, ImageStat

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Your Morrowind folder (the one holding extracted/ and morrowmods/). Defaults to this repo's parent.
MW = os.environ.get("MORROWIND_DIR", os.path.dirname(ROOT))
SEARCH = [
    f"{MW}/morrowmods/Intelligent Textures-47469-2-0-1671912841 (1)/00 Core/textures",
    f"{MW}/extracted/Data Files/Textures",
]
PINCHY_SHOT = f"{MW}/morrowmods/PetMudcrab/docs/pinchy.png"
BOOK_FONT = f"{MW}/extracted/Data Files/BookArt/Magic Cards.ttf"  # Morrowind's book lettering (Neale Davidson, 1998)
OUT = os.path.join(ROOT, "textures")
INK = (36, 24, 16)
# Dunmer town banners whose brush glyphs read best once lifted off the cloth
GLYPH_TOWNS = ["Vos", "Hla_Oad", "Khull", "Sadrith_Mora", "Gnaar_Mok", "Ald_Velothi", "Tel_Aruhn", "Tel_Vos"]


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


# ---------------------------------------------------------------- ink glyphs


def local_bg(ch):
    """The cloth's own level under each pixel: a median wider than any brush stroke."""
    w, h = ch.size
    sm = ch.resize((w // 8, h // 8), Image.BILINEAR).filter(ImageFilter.MedianFilter(9)).filter(ImageFilter.MaxFilter(3))
    return np.asarray(sm.resize((w, h), Image.BILINEAR)).astype(float)


def ink_alpha(im):
    """How inked each pixel is: darker than the cloth around it, or redder than it."""
    rgb = im.convert("RGB")
    arr = np.asarray(rgb).astype(float)
    lum_img = rgb.convert("L")
    dark = np.clip((local_bg(lum_img) - np.asarray(lum_img).astype(float) - 22) / 38, 0, 1)
    red = arr[..., 0] - (arr[..., 1] + arr[..., 2]) / 2
    red_bg = local_bg(Image.fromarray(np.clip(red + 128, 0, 255).astype(np.uint8))) - 128
    reds = np.clip((red - red_bg - 18) / 32, 0, 1)
    return np.maximum(dark, reds) * (np.asarray(im)[..., 3] / 255.0)


def opened(a, k=3):
    """Morphological opening on an alpha array: removes lines thinner than k (cloth cracks)."""
    img = Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8))
    return np.asarray(img.filter(ImageFilter.MinFilter(k)).filter(ImageFilter.MaxFilter(k))).astype(float) / 255


def keep_big(a, min_area):
    """A soft mask keeping only ink blobs of at least min_area pixels (specks dropped)."""
    with tempfile.NamedTemporaryFile(suffix=".png") as tmp:
        Image.fromarray(((a > 0.27) * 255).astype(np.uint8)).save(tmp.name)
        subprocess.run(["magick", tmp.name, "-define", f"connected-components:area-threshold={min_area}",
                        "-define", "connected-components:mean-color=true", "-connected-components", "8", tmp.name],
                       check=True)
        keep = Image.open(tmp.name).convert("L").point(lambda v: 255 if v > 127 else 0)
        return np.asarray(keep.filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.GaussianBlur(1.2))).astype(float) / 255


def glyph_column(town):
    """A town banner's column of brush glyphs, in the banner's own red, black and ochre."""
    im = Image.open(find(f"Tx_de_banner_{town}")).convert("RGBA")
    h = im.height
    a = opened(np.clip(ink_alpha(im) * 1.35, 0, 1))
    a *= keep_big(a, 260)
    a[: int(h * 0.09)] = 0  # the cloth's border rows
    a[int(h * 0.84):] = 0
    rgb = np.asarray(im.convert("RGB")).astype(float) * 0.78  # a shade deeper, to read on our parchment
    out = Image.fromarray(np.dstack([rgb, a * 255]).astype(np.uint8), "RGBA")
    out = out.crop(out.getbbox())
    out.thumbnail((360, 520), Image.LANCZOS)
    out.save(f"{OUT}/glyphs/col-{town.lower().replace('_', '-')}.webp", quality=86, method=6)


def house_emblem(house):
    """The House symbol carved on its Vivec canton sign, lifted off the stone as ink lines."""
    im = Image.open(find(f"Tx_V_Sign_{house}_01")).convert("RGB")
    w, h = im.size
    raw = im.crop((int(0.24 * w), int(0.08 * h), int(0.76 * w), int(0.62 * h)))  # the medallion
    lum_img = ImageOps.autocontrast(raw.convert("L"), cutoff=1)
    lum = np.asarray(lum_img).astype(float)
    groove = np.clip((np.asarray(lum_img.filter(ImageFilter.GaussianBlur(14))).astype(float) - lum - 10) / 30, 0, 1)
    a = opened(groove)
    a *= keep_big(a, 300)
    yy, xx = np.mgrid[: a.shape[0], : a.shape[1]]
    a *= (xx - a.shape[1] / 2) ** 2 + (yy - a.shape[0] * 0.47) ** 2 < (a.shape[1] * 0.40) ** 2  # medallion only
    al = Image.fromarray((a * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3))  # hold up at icon size
    out = Image.new("RGBA", raw.size, INK + (0,))
    out.putalpha(al)
    out = out.crop(out.getbbox())
    out.thumbnail((256, 256), Image.LANCZOS)
    out.save(f"{OUT}/glyphs/house-{house.lower()}.webp", quality=90, method=6)


def velothi_glyph():
    """The Velothi glyph decal, recolored to our ink."""
    im = Image.open(find("Tx_Velothi_Glyph00")).convert("RGBA")
    arr = np.asarray(im).astype(float)
    lum = arr[..., :3] @ np.array([0.299, 0.587, 0.114])
    a = arr[..., 3] / 255 * np.clip((210 - lum) / 120, 0, 1)
    out = Image.new("RGBA", im.size, INK + (0,))
    out.putalpha(Image.fromarray((a * 255).astype(np.uint8)))
    out.crop(out.getbbox()).save(f"{OUT}/glyphs/velothi.webp", quality=90, method=6)


def main():
    os.makedirs(f"{OUT}/glyphs", exist_ok=True)
    os.makedirs(f"{OUT}/fonts", exist_ok=True)
    if os.path.exists(BOOK_FONT):
        with open(BOOK_FONT, "rb") as src, open(f"{OUT}/fonts/magic-cards.ttf", "wb") as dst:
            dst.write(src.read())
    parchment()
    for town in GLYPH_TOWNS:
        glyph_column(town)
    for house in ("Hlaalu", "Redoran", "Telvanni"):
        house_emblem(house)
    velothi_glyph()
    scroll = Image.open(find("scroll")).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
    scroll.save(f"{OUT}/scroll-v.webp", quality=82, method=6)  # style.css slices assume 1024x1024
    scroll.rotate(-90, expand=True).save(f"{OUT}/scroll-h.webp", quality=82, method=6)
    Image.open(find("Tx_parchment_03")).convert("RGB").resize((256, 256), Image.LANCZOS).save(f"{OUT}/fiber.jpg", quality=85)
    Image.open(find("menu_head_block_middle")).convert("RGB").save(f"{OUT}/trim.png", optimize=True)
    if os.path.exists(PINCHY_SHOT):
        shot = Image.open(PINCHY_SHOT).convert("RGB").crop((330, 130, 1030, 800))  # Pinchy and her Telvanni
        shot.resize((420, round(420 * shot.height / shot.width)), Image.LANCZOS).save(
            f"{OUT}/pinchy-field.jpg", quality=84, optimize=True)
    for d in (OUT, f"{OUT}/glyphs", f"{OUT}/fonts"):
        for f in sorted(os.listdir(d)):
            if os.path.isfile(os.path.join(d, f)):
                print(f"{os.path.relpath(os.path.join(d, f), OUT):28} {os.path.getsize(os.path.join(d, f)) // 1024:5} KB")


if __name__ == "__main__":
    main()
