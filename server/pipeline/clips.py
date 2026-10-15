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


# ---------------------------------------------------------------- Aura Scan: the rated video
# The take itself, with a quiet scan HUD over it, the four measured readouts landing one by one, then a
# three-second card with the score. Made in the background right after the read, so the result never waits.

SCAN_END_S = 3.2
_render_slots = asyncio.Semaphore(2)


def scan_src(vid: str) -> str:
    return os.path.join(CLIP_DIR, f"scan_{vid}_src.mp4")


def scan_out(vid: str) -> str:
    return os.path.join(CLIP_DIR, f"scan_{vid}.mp4")


def _vgrad(img: Image.Image, top: int, bottom: int, a0: int, a1: int) -> None:
    """Vertical black gradient on an RGBA image from alpha a0 at `top` to a1 at `bottom`."""
    d = ImageDraw.Draw(img)
    span = max(1, bottom - top)
    for y in range(min(top, bottom), max(top, bottom)):
        k = abs(y - top) / span
        d.line([(0, y), (W, y)], fill=(0, 0, 0, int(a0 + (a1 - a0) * k)))


def scan_hud(prompt: str, name: str, out: str) -> None:
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    _vgrad(img, 560, 0, 0, 165)
    _vgrad(img, 1240, H, 0, 200)
    d = ImageDraw.Draw(img)
    c, L, s = 56, 74, 4
    for x, y, dx, dy in ((c, c, 1, 1), (W - c, c, -1, 1), (c, H - c, 1, -1), (W - c, H - c, -1, -1)):
        d.line([(x, y), (x + dx * L, y)], fill=(255, 255, 255, 230), width=s)
        d.line([(x, y), (x, y + dy * L)], fill=(255, 255, 255, 230), width=s)
    mono = _font("GeistMono_500Medium.ttf", 28)
    d.text((96, 104), "KLEOS  ·  AURA SCAN", font=mono, fill=(255, 255, 255, 255))
    nm = (name or "").upper()[:22]
    if nm:
        d.text((W - 96 - d.textlength(nm, font=mono), 104), nm, font=mono, fill=SOFT + (255,))
    ital = _font("InstrumentSerif_400Regular_Italic.ttf", 58)
    lines = _wrap(d, f"“{(prompt or '').strip()}”", ital, W - 192)[:3]
    y = 168
    for line in lines:
        d.text((96, y), line, font=ital, fill=(255, 255, 255, 255))
        y += 66
    small = _font("GeistMono_500Medium.ttf", 24)
    d.text((W - 96 - d.textlength("joinkleos.com", font=small), H - 118), "joinkleos.com", font=small, fill=(255, 255, 255, 170))
    img.save(out, "PNG")


def scan_chip(label: str, value: str, out: str) -> None:
    w, h = W - 192, 92
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=46, fill=(255, 255, 255, 40), outline=(255, 255, 255, 110), width=2)
    mono = _font("GeistMono_500Medium.ttf", 28)
    serif = _font("InstrumentSerif_400Regular.ttf", 60)
    d.text((40, (h - 30) // 2), label.upper(), font=mono, fill=(255, 255, 255, 235))
    d.text((w - 40 - d.textlength(value, font=serif), (h - 66) // 2 - 4), value, font=serif, fill=(255, 255, 255, 255))
    img.save(out, "PNG")


def scan_line(out: str) -> None:
    img = Image.new("RGBA", (W, 14), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    for y, a in ((6, 200), (5, 120), (7, 120), (4, 50), (8, 50), (3, 20), (9, 20)):
        d.line([(0, y), (W, y)], fill=(214, 210, 255, a))
    img.save(out, "PNG")


def scan_end(r: dict, out: str) -> None:
    img = Image.new("RGB", (W, H), BLUE)
    arts = sorted(glob.glob(os.path.join(ART, "a_*.webp")))
    if arts:
        a = Image.open(random.choice(arts)).convert("RGB")
        a = a.resize((W, int(a.height * W / a.width)), Image.LANCZOS)
        img.paste(a.crop((0, 0, W, min(a.height, 1100))), (0, 0))
    fade = Image.new("L", (1, H))
    for y in range(H):
        fade.putpixel((0, y), 0 if y < 520 else min(255, int((y - 520) / 440 * 255)))
    img = Image.composite(Image.new("RGB", (W, H), BLUE), img, fade.resize((W, H)))
    d = ImageDraw.Draw(img)
    mono = _font("GeistMono_500Medium.ttf", 30)
    d.text((80, 90), "KLEOS  ·  AURA SCAN", font=mono, fill=WHITE)
    nm = (r.get("name") or "").upper()[:22]
    if nm:
        d.text((W - 80 - d.textlength(nm, font=mono), 90), nm, font=mono, fill=SOFT)
    big = _font("InstrumentSerif_400Regular.ttf", 340)
    score = str(r.get("score", ""))
    d.text((70, 1010), score, font=big, fill=WHITE)
    d.text((86, 1390), f"{(r.get('tier') or '').upper()}  ·  AURA", font=mono, fill=SOFT)
    serif = _font("InstrumentSerif_400Regular.ttf", 78)
    d.text((80, 1440), (r.get("archetype") or "")[:28], font=serif, fill=WHITE)
    sans = _font("Geist_400Regular.ttf", 38)
    y = 1550
    for line in _wrap(d, r.get("roast") or "", sans, W - 160)[:3]:
        d.text((80, y), line, font=sans, fill=SOFT)
        y += 52
    d.text((W - 80 - d.textlength("joinkleos.com", font=mono), 1820), "joinkleos.com", font=mono, fill=SOFT)
    img.save(out, "PNG")


def _probe(path: str) -> tuple[float, bool]:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type", "-of", "json", path], capture_output=True, text=True, timeout=30)
    import json as _json
    info = _json.loads(out.stdout or "{}")
    dur = float((info.get("format") or {}).get("duration") or 15.0)
    has_audio = any(s.get("codec_type") == "audio" for s in info.get("streams", []))
    return max(1.0, min(dur, 60.0)), has_audio


def render_scan(src: str, r: dict, out: str) -> None:
    dur, has_audio = _probe(src)
    axes = r.get("axes") or {}
    chips = [("Delivery", axes.get("delivery")), ("Composure", axes.get("composure")), ("Command", axes.get("command")), ("Posture", axes.get("posture"))]
    with tempfile.TemporaryDirectory(prefix="kleos_scan_") as tmp:
        hud, line, end = (os.path.join(tmp, n) for n in ("hud.png", "line.png", "end.png"))
        scan_hud(r.get("prompt") or "", r.get("name") or "", hud)
        scan_line(line)
        scan_end(r, end)
        chip_files = []
        for i, (label, v) in enumerate(chips):
            p = os.path.join(tmp, f"chip{i}.png")
            scan_chip(label, str(v if isinstance(v, (int, float)) else "–"), p)
            chip_files.append(p)
        ins = ["-i", src, "-loop", "1", "-t", f"{dur:.2f}", "-i", hud, "-loop", "1", "-t", f"{dur:.2f}", "-i", line]
        for p in chip_files:
            ins += ["-loop", "1", "-t", f"{dur:.2f}", "-i", p]
        ins += ["-loop", "1", "-t", f"{SCAN_END_S}", "-i", end]
        ins += ["-f", "lavfi", "-t", f"{SCAN_END_S}", "-i", "anullsrc=r=44100:cl=stereo"]
        if not has_audio:
            ins += ["-f", "lavfi", "-t", f"{dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo"]
        n_end, n_sil = 3 + len(chip_files), 4 + len(chip_files)
        main_a = "0:a" if has_audio else f"{n_sil + 1}:a"
        f = [
            "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[b]",
            "[b][1:v]overlay=0:0:shortest=1[h]",
            f"[h][2:v]overlay=0:'mod(t*620,{H})':shortest=1[v0]",
        ]
        prev = "v0"
        for i in range(len(chip_files)):
            at = dur * (0.16 + 0.17 * i)
            f.append(f"[{3 + i}:v]format=rgba,fade=t=in:st={at:.2f}:d=0.35:alpha=1[c{i}]")
            f.append(f"[{prev}][c{i}]overlay=96:{1300 + i * 112}:shortest=1[v{i + 1}]")
            prev = f"v{i + 1}"
        f.append(f"[{prev}]format=yuv420p[vm]")
        f.append(f"[{n_end}:v]scale={W}:{H},setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=0.35[ve]")
        f.append(f"[{main_a}]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{dur:.2f},asetpts=PTS-STARTPTS[am]")
        f.append(f"[{n_sil}:a]aresample=44100,aformat=channel_layouts=stereo[ae]")
        f.append("[vm][am][ve][ae]concat=n=2:v=1:a=1[v][a]")
        _ffmpeg([*ins, "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p",
                 "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out + ".part.mp4"])
        os.replace(out + ".part.mp4", out)


async def make_scan(vid: str, r: dict) -> None:
    """Render the rated video from the kept take, then delete the take. Errors leave a marker for the poll."""
    src = scan_src(vid)
    try:
        async with _render_slots:
            await asyncio.to_thread(render_scan, src, r, scan_out(vid))
    except Exception as e:
        print("scan render failed:", repr(e)[:300])
        open(scan_out(vid) + ".failed", "w").close()
    finally:
        try:
            os.remove(src)
        except OSError:
            pass
