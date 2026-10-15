"""Kleos print treatment: electric-blue duotone, grain + ordered dither, scanlines, rays, slight misregistration.
Usage: python kleosify.py in.jpg out.webp --style dither|scan|mix --w 1080 --h 1350 [--rays x,y] [--focus x,y] [--alpha]
"""
import argparse, math, random
import numpy as np
from PIL import Image, ImageFilter, ImageOps

BLUE = np.array([22, 8, 242], dtype=np.float32)      # #1608F2
INK = np.array([10, 4, 150], dtype=np.float32)       # deep shadow
PAPER = np.array([236, 236, 255], dtype=np.float32)  # pale lavender white


def bayer(n=8):
    m = np.array([[0]])
    while m.shape[0] < n:
        m = np.block([[4 * m, 4 * m + 2], [4 * m + 3, 4 * m + 1]])
    return (m + 0.5) / m.size


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


def tone(g, lo=0.06, hi=0.92, gamma=1.0, clahe=True):
    if clahe:
        # local contrast: unsharp at large radius (cheap CLAHE stand-in)
        im = Image.fromarray((g * 255).astype(np.uint8))
        im = im.filter(ImageFilter.UnsharpMask(radius=40, percent=90, threshold=0))
        g = np.asarray(im).astype(np.float32) / 255
    g = np.clip((g - lo) / (hi - lo), 0, 1) ** gamma
    return g


def dither(g, scale=2, amount=1.0, grain=0.10, seed=1):
    rng = np.random.default_rng(seed)
    h, w = g.shape
    small = np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w // scale, h // scale), Image.BILINEAR)).astype(np.float32) / 255
    sh, sw = small.shape
    B = bayer(8)
    t = np.tile(B, (sh // 8 + 1, sw // 8 + 1))[:sh, :sw]
    noisy = small + rng.normal(0, grain, small.shape)
    d = (noisy > t).astype(np.float32)
    d = np.asarray(Image.fromarray((d * 255).astype(np.uint8)).resize((w, h), Image.NEAREST)).astype(np.float32) / 255
    return g * (1 - amount) + d * amount


def scanlines(g, period=5, seed=2):
    h, w = g.shape
    y = np.arange(h)[:, None] % period
    # line thickness grows with brightness: bright = thick light lines
    thick = g * period
    jitter = np.random.default_rng(seed).normal(0, 0.25, (h, w))
    return ((y + jitter) < thick).astype(np.float32)


def rays(h, w, cx, cy, n=140, seed=3, inner=0.12, outer=1.2, alpha=0.75):
    from PIL import ImageDraw
    rng = random.Random(seed)
    im = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(im)
    R = max(w, h)
    for i in range(n):
        a = rng.random() * math.tau
        r0 = R * (inner + rng.random() * 0.15)
        r1 = R * (outer * (0.45 + rng.random() * 0.55))
        width = 1 if rng.random() < 0.8 else 2
        d.line([(cx + r0 * math.cos(a), cy + r0 * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a))], fill=int(255 * (0.35 + 0.65 * rng.random()) * alpha), width=width)
    return np.asarray(im).astype(np.float32) / 255


def colorize(v, shadow_ink=0.25):
    v = np.clip(v, 0, 1)[..., None]
    base = BLUE * (1 - v) + PAPER * v
    # deepest shadows dip toward ink for depth
    s = np.clip((0.12 - v) / 0.12, 0, 1) * shadow_ink
    return base * (1 - s) + INK * s


def glitch(rgb, seed=4, bands=6, max_shift=14, fringe=2):
    rng = np.random.default_rng(seed)
    out = rgb.copy()
    h = rgb.shape[0]
    for _ in range(bands):
        y = rng.integers(0, h - 10); hh = rng.integers(3, 18); s = int(rng.integers(-max_shift, max_shift))
        out[y:y + hh] = np.roll(out[y:y + hh], s, axis=1)
    if fringe:
        out[..., 0] = np.roll(out[..., 0], fringe, axis=1)  # magenta/cyan misregistration on edges
    return out


def run(src, dst, style="mix", w=1080, h=1350, focus=(0.5, 0.4), ray=None, alpha=False, seed=1, gamma=1.0, lo=None, hi=None, glitchy=True, lop=3.0, vig=0.0):
    im = Image.open(src)
    a = None
    if alpha and im.mode == "RGBA":
        a = im.split()[-1]
    im = im.convert("RGB")
    if a is not None:
        # fit, don't crop, cut-outs
        im2 = Image.new("RGB", im.size, (0, 0, 0)); im2.paste(im, mask=a); im = im2
        scale = min(w / im.width, h / im.height)
        size = (int(im.width * scale), int(im.height * scale))
        im = im.resize(size, Image.LANCZOS); a = a.resize(size, Image.LANCZOS)
        w, h = size
    else:
        im = crop_to(im, w, h, focus)
    g = np.asarray(ImageOps.grayscale(im)).astype(np.float32) / 255
    if lo is None:
        lo, hi = np.percentile(g, lop), np.percentile(g, 99.3)
    g = tone(g, lo, hi, gamma)
    if vig:
        yy, xx = np.mgrid[0:h, 0:w]
        r = np.sqrt(((xx - w * focus[0]) / w) ** 2 + ((yy - h * 0.45) / h) ** 2)
        g = g * np.clip(1 - vig * (r - 0.25) / 0.5, 0.35, 1)
    if style == "dither":
        v = dither(g, scale=2, amount=0.85, grain=0.09, seed=seed)
    elif style == "scan":
        v = scanlines(g, period=5, seed=seed) * 0.9 + g * 0.1
    else:  # mix: continuous tone + dither grain + faint scanlines
        d = dither(g, scale=2, amount=1.0, grain=0.11, seed=seed)
        sl = (np.arange(g.shape[0])[:, None] % 4 == 0).astype(np.float32)
        v = g * 0.45 + d * 0.55
        v = v * (1 - sl * 0.18)
    if ray is not None:
        r = rays(h, w, ray[0] * w, ray[1] * h, seed=seed + 7)
        v = np.maximum(v, r * (1 - g * 0.6))
    rgb = colorize(v)
    if glitchy:
        rgb = glitch(rgb, seed=seed, bands=5 if a is None else 0, fringe=2)
    out = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    if a is not None:
        out.putalpha(a)
    out.save(dst, quality=86, method=6)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--style", default="mix"); ap.add_argument("--w", type=int, default=1080); ap.add_argument("--h", type=int, default=1350)
    ap.add_argument("--focus", default="0.5,0.4"); ap.add_argument("--rays", default=None); ap.add_argument("--alpha", action="store_true")
    ap.add_argument("--seed", type=int, default=1); ap.add_argument("--gamma", type=float, default=1.0)
    ap.add_argument("--noglitch", action="store_true"); ap.add_argument("--lop", type=float, default=3.0); ap.add_argument("--vig", type=float, default=0.0)
    x = ap.parse_args()
    run(x.src, x.dst, x.style, x.w, x.h, tuple(map(float, x.focus.split(","))), tuple(map(float, x.rays.split(","))) if x.rays else None, x.alpha, x.seed, x.gamma, glitchy=not x.noglitch, lop=x.lop, vig=x.vig)
