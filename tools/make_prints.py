"""Hermes-style light prints: blue dither statue on transparent, with rays and orbit lines.

python tools/make_prints.py  → assets/img/lp_*.webp
"""
import math, random, os
import numpy as np
from PIL import Image, ImageDraw, ImageOps, ImageFilter

BLUE = (21, 21, 224)
S = 900
ROOT = os.path.join(os.path.dirname(__file__), "..", "assets", "img")
BAYER = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]) + 0.5) / 16


def dither(gray: np.ndarray) -> np.ndarray:
    h, w = gray.shape
    th = np.tile(BAYER, (h // 4 + 1, w // 4 + 1))[:h, :w]
    return gray < th  # True = ink


def make(src, out, crop=None, scale=0.86, head=(0.5, 0.28), seed=1, orbits=True):
    rnd = random.Random(seed)
    im = Image.open(os.path.join(ROOT, src)).convert("RGBA")
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    bb = im.getchannel("A").getbbox()
    im = im.crop(bb)
    # fit
    k = min(S * scale / im.height, S * 0.9 / im.width)
    im = im.resize((int(im.width * k), int(im.height * k)), Image.LANCZOS)
    x0 = (S - im.width) // 2
    y0 = S - im.height if not crop else (S - im.height) // 2 + 30
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))

    # rays + orbits layer
    lines = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(lines)
    cx, cy = x0 + im.width * head[0], y0 + im.height * head[1]
    for i in range(110):
        a = rnd.uniform(0, 2 * math.pi)
        r0 = rnd.uniform(70, 160)
        r1 = rnd.uniform(330, 640)
        alpha = rnd.choice([60, 90, 120, 160])
        d.line([(cx + r0 * math.cos(a), cy + r0 * math.sin(a)), (cx + r1 * math.cos(a), cy + r1 * math.sin(a))], fill=BLUE + (alpha,), width=rnd.choice([1, 1, 2]))
    if orbits:
        for rx, ry, rot in [(330, 120, -14), (390, 150, 18), (250, 250, 0)]:
            o = Image.new("RGBA", (S, S), (0, 0, 0, 0))
            od = ImageDraw.Draw(o)
            od.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=BLUE + (150,), width=2)
            o = o.rotate(rot, center=(cx, cy), resample=Image.BICUBIC)
            lines = Image.alpha_composite(lines, o)
        # small node dots on the big orbit
        dd = ImageDraw.Draw(lines)
        for a in (0.4, 2.3, 4.1):
            px, py = cx + 250 * math.cos(a), cy + 250 * math.sin(a)
            dd.ellipse([px - 5, py - 5, px + 5, py + 5], fill=BLUE + (255,))
    canvas = Image.alpha_composite(canvas, lines)

    # statue: chunky ordered dither, blue ink / white paper, opaque inside the silhouette
    q = 3
    small = im.resize((im.width // q, im.height // q), Image.LANCZOS)
    g = np.asarray(ImageOps.autocontrast(small.convert("L"), cutoff=2), dtype=np.float32) / 255
    g = np.clip((g - 0.08) / 0.84, 0, 1) ** 1.25
    ink = dither(g)
    a = np.asarray(small.getchannel("A")) > 128
    rgba = np.zeros((*g.shape, 4), np.uint8)
    rgba[a & ink] = BLUE + (255,)
    rgba[a & ~ink] = (255, 255, 255, 255)
    st = Image.fromarray(rgba, "RGBA").resize((small.width * q, small.height * q), Image.NEAREST)
    # thin blue outline so white highlights hold their shape on white pages
    edge = st.getchannel("A").filter(ImageFilter.MaxFilter(5))
    ring = Image.new("RGBA", st.size, BLUE + (255,))
    ring.putalpha(edge)
    canvas.alpha_composite(ring, (x0 - (st.width - im.width) // 2, y0))
    canvas.alpha_composite(st, (x0 - (st.width - im.width) // 2, y0))
    canvas.save(os.path.join(ROOT, out), "WEBP", quality=88, method=6)
    print("wrote", out)


if __name__ == "__main__":
    make("marble_248579.webp", "lp_athlete.webp", seed=3)
    make("marble_249049.webp", "lp_bust.webp", seed=5)
    make("marble_256530.webp", "lp_antinoos.webp", head=(0.5, 0.18), seed=7)
    make("marble_255422.webp", "lp_head.webp", seed=9)
    make("marble_248579.webp", "lp_face_athlete.webp", crop=(0, 0, 1, 0.62), scale=0.8, head=(0.5, 0.4), seed=11)
    make("marble_256530.webp", "lp_face_antinoos.webp", crop=(0.1, 0, 0.9, 0.42), scale=0.8, head=(0.5, 0.4), seed=13)
    make("marble_255422.webp", "lp_face_head.webp", crop=(0, 0, 1, 0.75), scale=0.8, head=(0.5, 0.4), seed=15)
    make("marble_250675.webp", "lp_bustDark.webp", seed=17)
