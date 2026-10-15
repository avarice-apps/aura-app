"""Kleos heritage print: Kleos blue (or navy) ink on ivory, fine film grain, a soft engraved halftone in the shadows.
The style-section sibling of kleosify.py (electric blue). Source images: CC0 public-domain works only.
Usage: python heritage.py in.jpg out.webp --w 1080 --h 1350 [--focus x,y] [--gamma 1.0]
"""
import argparse
import numpy as np
from PIL import Image, ImageFilter, ImageOps

IVORY = np.array([241, 235, 221], dtype=np.float32)  # #F1EBDD
INKS = {
    # Kleos blue on ivory (default): the brand's electric blue, printed like a catalogue plate
    "blue": (np.array([12, 6, 120], dtype=np.float32), np.array([22, 8, 242], dtype=np.float32)),
    "navy": (np.array([18, 27, 51], dtype=np.float32), np.array([58, 70, 102], dtype=np.float32)),
}
INK, MID = INKS["blue"]


def crop_to(im, w, h, focus=(0.5, 0.4)):
    r = w / h
    W, H = im.size
    if W / H > r:
        nw = int(H * r); x = int(max(0, min(W - nw, focus[0] * W - nw / 2)))
        im = im.crop((x, 0, x + nw, H))
    else:
        nh = int(W / r); y = int(max(0, min(H - nh, focus[1] * H - nh / 2)))
        im = im.crop((0, y, W, y + nh))
    return im.resize((w, h), Image.LANCZOS)


def run(src, dst, w=1080, h=1350, focus=(0.5, 0.4), gamma=1.0, seed=7, ink="blue"):
    global INK, MID
    INK, MID = INKS[ink]
    im = crop_to(Image.open(src).convert("RGB"), w, h, focus)
    g = ImageOps.grayscale(im)
    g = ImageOps.autocontrast(g, cutoff=1.5)
    g = g.filter(ImageFilter.UnsharpMask(radius=30, percent=60, threshold=0))
    v = (np.asarray(g).astype(np.float32) / 255) ** gamma
    rng = np.random.default_rng(seed)
    # engraved feel: fine diagonal line screen that only shows in the shadows
    yy, xx = np.mgrid[0:h, 0:w]
    lines = (np.sin((xx + yy) * 0.9) * 0.5 + 0.5)
    shadow = np.clip(0.55 - v, 0, 0.55) / 0.55
    v = v - shadow * 0.10 * lines
    # film grain, finer in the highlights
    v = np.clip(v + rng.normal(0, 0.035, v.shape) * (0.6 + 0.4 * (1 - v)), 0, 1)
    # three-stop duotone: ink → slate → ivory
    a = np.clip(v * 2, 0, 1)[..., None]
    b = np.clip(v * 2 - 1, 0, 1)[..., None]
    rgb = np.where(v[..., None] < 0.5, INK * (1 - a) + MID * a, MID * (1 - b) + IVORY * b)
    # paper: a whisper of warm unevenness
    paper = rng.normal(0, 3.0, (h // 8 + 1, w // 8 + 1))
    paper = np.asarray(Image.fromarray(((paper + 8) * 10).clip(0, 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)).astype(np.float32) / 255 - 0.31
    rgb = np.clip(rgb + paper[..., None] * 6, 0, 255)
    Image.fromarray(rgb.astype(np.uint8)).save(dst, "WEBP", quality=82, method=6)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--w", type=int, default=1080); ap.add_argument("--h", type=int, default=1350)
    ap.add_argument("--focus", default="0.5,0.4"); ap.add_argument("--gamma", type=float, default=1.0)
    ap.add_argument("--ink", default="blue", choices=list(INKS))
    a = ap.parse_args()
    fx, fy = (float(x) for x in a.focus.split(","))
    run(a.src, a.dst, a.w, a.h, (fx, fy), a.gamma, ink=a.ink)
