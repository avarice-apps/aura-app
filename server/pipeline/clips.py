"""Aura Replay clips: a 15-second vertical video of the moment a call turned, ready to post.

A still poster (the print, the line that changed it, the score) over the real audio of that moment with a live
waveform. If the call has no recording, Poise reads the verdict instead. Recordings are kept for at most two
hours for this, then deleted.
"""
from __future__ import annotations

import asyncio
import glob
import os
import random
import subprocess
import tempfile
import textwrap
import time

from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.dirname(__file__))
FONTS = os.path.join(HERE, "assets", "fonts")
ART = os.path.join(HERE, "assets", "art")
CLIP_DIR = os.path.join(HERE, "data", "clips")
KEEP_S = 2 * 3600
W, H = 1080, 1920
BLUE = (22, 8, 242)
WHITE = (255, 255, 255)
SOFT = (214, 210, 255)


def gc() -> None:
    """Delete recordings and clips older than two hours."""
    os.makedirs(CLIP_DIR, exist_ok=True)
    now = time.time()
    for p in glob.glob(os.path.join(CLIP_DIR, "*")):
        try:
            if now - os.path.getmtime(p) > KEEP_S:
                os.remove(p)
        except OSError:
            pass


def rec_path(sid: str) -> str:
    return os.path.join(CLIP_DIR, f"{sid}.mp3")


def clip_path(sid: str) -> str:
    return os.path.join(CLIP_DIR, f"{sid}.mp4")


def _font(name: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def _wrap(draw: ImageDraw.ImageDraw, text: str, font, width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= width:
            cur = trial
        else:
            if cur:
                lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def poster(title: str, quote: str, verdict: str, rating: int | None, out: str, art: str | None = None) -> None:
    img = Image.new("RGB", (W, H), BLUE)
    arts = sorted(glob.glob(os.path.join(ART, "a_*.webp")))  # the statues
    src = art if art and os.path.exists(art) else (random.choice(arts) if arts else None)
    if src:
        a = Image.open(src).convert("RGB")
        a = a.resize((W, int(a.height * W / a.width)), Image.LANCZOS)
        img.paste(a.crop((0, 0, W, min(a.height, 1250))), (0, 0))
    # fade the print into the blue
    fade = Image.new("L", (1, H))
    for y in range(H):
        fade.putpixel((0, y), 0 if y < 620 else min(255, int((y - 620) / 420 * 255)))
    img = Image.composite(Image.new("RGB", (W, H), BLUE), img, fade.resize((W, H)))
    d = ImageDraw.Draw(img)
    mono, serif, ital, sans = _font("GeistMono_500Medium.ttf", 30), _font("InstrumentSerif_400Regular.ttf", 64), _font("InstrumentSerif_400Regular_Italic.ttf", 70), _font("Geist_400Regular.ttf", 38)
    d.text((80, 90), "KLEOS  ·  AURA REPLAY", font=mono, fill=WHITE)
    d.text((80, 140), (title or "")[:42], font=serif, fill=WHITE)
    y = 1300
    q = (quote or verdict or "").strip().strip('"“”')
    lines = _wrap(d, f"“{q}”", ital, W - 160)
    if len(lines) > 3:
        lines = lines[:3]
        lines[-1] = lines[-1].rstrip("”,. ") + "…”"
    for line in lines:
        d.text((80, y), line, font=ital, fill=WHITE)
        y += 78
    y += 18
    vl = _wrap(d, verdict or "", sans, W - 160)
    if len(vl) > 2:
        vl = vl[:2]
        vl[-1] = vl[-1].rstrip(",.;: ") + "…"
    for line in vl:
        d.text((80, y), line, font=sans, fill=SOFT)
        y += 50
    if rating is not None:
        d.text((80, 1690), "AURA", font=mono, fill=SOFT)
        d.text((80, 1722), str(rating), font=_font("InstrumentSerif_400Regular.ttf", 150), fill=WHITE)
    d.text((W - 80 - d.textlength("joinkleos.com", font=mono), 1820), "joinkleos.com", font=mono, fill=SOFT)
    img.save(out, "PNG")


def window(rec_times: list[dict], turn: int | None) -> float:
    """Start time of the clip: the line he answered at the turning point, a beat before he speaks."""
    users = [m for m in rec_times if m.get("role") == "user" and (m.get("message") or "").strip()]
    if not users:
        return 0.0
    k = max(0, min(len(users) - 1, (turn or 1) - 1))
    t_user = float(users[k].get("time_in_call_secs") or 0)
    before = [float(m.get("time_in_call_secs") or 0) for m in rec_times if m.get("role") != "user" and float(m.get("time_in_call_secs") or 0) < t_user]
    start = max(before) if before else t_user - 4
    if t_user - start > 9:  # a long line before him: start closer to his answer
        start = t_user - 6
    return max(0.0, start - 0.3)


def _ffmpeg(args: list[str]) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True, timeout=90)


def render(png: str, audio: str, start: float, out: str, dur: float = 15.0) -> None:
    _ffmpeg([
        "-loop", "1", "-framerate", "24", "-i", png,
        "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", audio,
        "-filter_complex", "[1:a]aformat=channel_layouts=mono,showwaves=s=920x170:mode=cline:rate=24:scale=sqrt:colors=0xFFFFFF[w];[0:v][w]overlay=80:1120:shortest=1,format=yuv420p[v]",
        "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "28", "-r", "24",
        "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out,
    ])


async def make(sid: str, s: dict, evaluation: dict, tts_bytes=None) -> str:
    """Build (or reuse) the clip for a finished call. Returns the mp4 path."""
    gc()
    out = clip_path(sid)
    if os.path.exists(out):
        return out
    tp = evaluation.get("turning_point") or {}
    ch = evaluation.get("change") or {}
    quote = tp.get("quote") or ch.get("quote") or ""
    turn = tp.get("turn") or ch.get("turn")
    title = s["spec"].get("title") or s["spec"].get("setting", "")[:40]
    with tempfile.TemporaryDirectory(prefix="kleos_clip_") as tmp:
        png = os.path.join(tmp, "poster.png")
        await asyncio.to_thread(poster, title, quote, evaluation.get("verdict") or "", evaluation.get("rating"), png)
        rec = rec_path(sid)
        if os.path.exists(rec) and s.get("rec_times"):
            start = window(s["rec_times"], turn)
            await asyncio.to_thread(render, png, rec, start, out)
        else:
            if tts_bytes is None:
                raise FileNotFoundError("no recording and no voice")
            line = " ".join((evaluation.get("script") or evaluation.get("verdict") or "").split()[:38])
            voice = os.path.join(tmp, "poise.mp3")
            with open(voice, "wb") as f:
                f.write(await tts_bytes(line))
            await asyncio.to_thread(render, png, voice, 0.0, out)
    return out
