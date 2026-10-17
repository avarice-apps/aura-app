"""Aura Replay clips: a 15-second vertical video of the moment a call turned, ready to post.

A still poster (the print, the line that changed it, the score) over the real audio of that moment with a live
waveform. If the call has no recording, Poise reads the verdict instead. Recordings are kept for at most two
hours for this, then deleted.
"""
from __future__ import annotations

import asyncio
import glob
import os
import secrets
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


def _ffmpeg(args: list[str], timeout: int = 90) -> None:
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", *args], check=True, timeout=timeout)


def render(png: str, audio: str, start: float, out: str, dur: float = 15.0) -> None:
    _ffmpeg([
        "-loop", "1", "-framerate", "24", "-i", png,
        "-ss", f"{start:.2f}", "-t", f"{dur:.2f}", "-i", audio,
        "-filter_complex", "[1:a]aformat=channel_layouts=mono,showwaves=s=920x170:mode=cline:rate=24:scale=sqrt:colors=0xFFFFFF[w];[0:v][w]overlay=80:1120:shortest=1,format=yuv420p[v]",
        "-map", "[v]", "-map", "1:a", "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "28", "-r", "24",
        "-c:a", "aac", "-b:a", "128k", "-shortest", "-movflags", "+faststart", out,
    ])


async def make(sid: str, s: dict, evaluation: dict, tts_bytes=None) -> str:
    """Build (or reuse) the clip for a finished call. Returns the mp4 path.
    The file gets its own random name: the link can be shared without giving away the call's session id."""
    gc()
    if not s.get("clip_id"):
        s["clip_id"] = "c_" + secrets.token_hex(12)
    out = clip_path(s["clip_id"])
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


def _shadowed(img: Image.Image, xy, text: str, font, fill, blur: int = 10, alpha: int = 150) -> None:
    """Text with a soft shadow so it reads on any footage, with no box behind it."""
    sh = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sh).text(xy, text, font=font, fill=(0, 0, 0, alpha))
    img.alpha_composite(sh.filter(ImageFilter.GaussianBlur(blur)))
    ImageDraw.Draw(img).text(xy, text, font=font, fill=fill)


def scan_hud(title: str, name: str, out: str, label: str = "AURA SCAN") -> None:
    """Editorial frame: soft fades top and bottom, a serif wordmark, a small mono label, the prompt or title in
    italic. Nothing that looks like a camcorder."""
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    _vgrad(img, 520, 0, 0, 150)
    _vgrad(img, 1080, H, 0, 215)
    word = _font("InstrumentSerif_400Regular.ttf", 64)
    mono = _font("GeistMono_500Medium.ttf", 24)
    _shadowed(img, (80, 78), "Kleos", word, (255, 255, 255, 255))
    d = ImageDraw.Draw(img)
    lab = label.upper() + (f"  ·  {name.upper()[:18]}" if name else "")
    _shadowed(img, (W - 80 - d.textlength(lab, font=mono), 104), lab, mono, (255, 255, 255, 230), blur=6)
    ital = _font("InstrumentSerif_400Regular_Italic.ttf", 50)
    y = 178
    for line in _wrap(d, (title or "").strip(), ital, W - 160)[:2]:
        _shadowed(img, (80, y), line, ital, (255, 255, 255, 240))
        y += 58
    small = _font("GeistMono_500Medium.ttf", 22)
    _shadowed(img, (W - 80 - d.textlength("joinkleos.com", font=small), H - 92), "joinkleos.com", small, (255, 255, 255, 170), blur=5)
    img.save(out, "PNG")


def scan_chip(label: str, value: str, out: str) -> None:
    """One measured readout as a line of type: mono label, hairline, serif number."""
    w, h = W - 160, 96
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    mono = _font("GeistMono_500Medium.ttf", 26)
    serif = _font("InstrumentSerif_400Regular.ttf", 72)
    ImageDraw.Draw(img).line([(0, h - 2), (w, h - 2)], fill=(255, 255, 255, 110), width=2)
    _shadowed(img, (0, 46), label.upper(), mono, (255, 255, 255, 235), blur=6)
    d = ImageDraw.Draw(img)
    _shadowed(img, (w - d.textlength(value, font=serif), 6), value, serif, (255, 255, 255, 255))
    img.save(out, "PNG")


def scan_end(r: dict, out: str, kicker: str = "KLEOS  ·  AURA SCAN", suffix: str = "  ·  AURA") -> None:
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
    d.text((80, 90), kicker, font=mono, fill=WHITE)
    nm = (r.get("name") or "").upper()[:22]
    if nm:
        d.text((W - 80 - d.textlength(nm, font=mono), 90), nm, font=mono, fill=SOFT)
    big = _font("InstrumentSerif_400Regular.ttf", 340)
    score = str(r.get("score", ""))
    d.text((70, 1010), score, font=big, fill=WHITE)
    d.text((86, 1390), f"{(r.get('tier') or '').upper()}{suffix}", font=mono, fill=SOFT)
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


def _render_overlay(src: str, out: str, hud: str, timed: list, end: str) -> None:
    """The take, cropped to 9:16, with the frame throughout, timed images (path, x, y, show_at,
    hide_at or None) fading in and out over it, then the end card. Audio is the take's own; silence under the card."""
    dur, has_audio = _probe(src)
    ins = ["-i", src, "-loop", "1", "-t", f"{dur:.2f}", "-i", hud]
    for p, *_ in timed:
        ins += ["-loop", "1", "-t", f"{dur:.2f}", "-i", p]
    ins += ["-loop", "1", "-t", f"{SCAN_END_S}", "-i", end, "-f", "lavfi", "-t", f"{SCAN_END_S}", "-i", "anullsrc=r=44100:cl=stereo"]
    n_end, n_sil = 2 + len(timed), 3 + len(timed)
    if not has_audio:
        ins += ["-f", "lavfi", "-t", f"{dur:.2f}", "-i", "anullsrc=r=44100:cl=stereo"]
    main_a = "0:a" if has_audio else f"{n_sil + 1}:a"
    f = [
        "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30[b]",
        "[b][1:v]overlay=0:0:shortest=1[v0]",
    ]
    prev = "v0"
    for i, item in enumerate(timed):
        _, x, y, at, until = item[:5]
        cut = len(item) > 5 and item[5]  # hard cut out (the next item replaces it in place)
        at = max(0.0, min(at, dur - 0.4))
        fades = f"fade=t=in:st={at:.2f}:d={0.1 if cut else 0.2}:alpha=1"
        enable = ""
        if until is not None and until < dur:
            if cut:
                enable = f":enable='lt(t,{until:.2f})'"
            else:
                fades += f",fade=t=out:st={max(at + 0.3, until - 0.3):.2f}:d=0.3:alpha=1"
        f.append(f"[{2 + i}:v]format=rgba,{fades}[c{i}]")
        f.append(f"[{prev}][c{i}]overlay={x}:{y}:shortest=1{enable}[v{i + 1}]")
        prev = f"v{i + 1}"
    f.append(f"[{prev}]format=yuv420p[vm]")
    f.append(f"[{n_end}:v]scale={W}:{H},setsar=1,fps=30,format=yuv420p,fade=t=in:st=0:d=0.35[ve]")
    f.append(f"[{main_a}]aresample=44100,aformat=channel_layouts=stereo,atrim=0:{dur:.2f},asetpts=PTS-STARTPTS[am]")
    f.append(f"[{n_sil}:a]aresample=44100,aformat=channel_layouts=stereo[ae]")
    f.append("[vm][am][ve][ae]concat=n=2:v=1:a=1[v][a]")
    _ffmpeg([*ins, "-filter_complex", ";".join(f), "-map", "[v]", "-map", "[a]",
             "-c:v", "libx264", "-preset", "veryfast", "-crf", "25", "-pix_fmt", "yuv420p",
             "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out + ".part.mp4"], timeout=300)
    os.replace(out + ".part.mp4", out)


def render_scan(src: str, r: dict, out: str) -> None:
    dur, _ = _probe(src)
    axes = r.get("axes") or {}
    chips = [("Delivery", axes.get("delivery")), ("Composure", axes.get("composure")), ("Command", axes.get("command")), ("Posture", axes.get("posture"))]
    with tempfile.TemporaryDirectory(prefix="kleos_scan_") as tmp:
        hud, end = os.path.join(tmp, "hud.png"), os.path.join(tmp, "end.png")
        scan_hud(f"“{(r.get('prompt') or '').strip()}”" if r.get("prompt") else "", r.get("name") or "", hud)
        scan_end(r, end)
        timed = []
        for i, (label, v) in enumerate(chips):
            p = os.path.join(tmp, f"chip{i}.png")
            scan_chip(label, str(v if isinstance(v, (int, float)) else "–"), p)
            timed.append((p, 80, 1310 + i * 112, dur * (0.16 + 0.17 * i), None))
        _render_overlay(src, out, hud, timed, end)


# ---- Aura Check: anything filmed live, rated beat by beat

def _secs(t) -> float:
    try:
        if isinstance(t, (int, float)):
            return float(t)
        parts = [float(x) for x in str(t).strip().split(":")]
        return parts[0] * 60 + parts[1] if len(parts) == 2 else parts[0]
    except Exception:
        return 0.0


def _signed(n: int) -> str:
    return f"+{n}" if n > 0 else (f"−{abs(n)}" if n < 0 else "0")


def beat_chip(points: int, text: str, out: str) -> None:
    """A beat as a subtitle: thin rule, big serif points, the beat in small mono. No box."""
    w, h = W - 160, 250
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    ImageDraw.Draw(img).line([(0, 6), (120, 6)], fill=(255, 255, 255, 230), width=3)
    serif = _font("InstrumentSerif_400Regular.ttf", 132)
    mono = _font("GeistMono_500Medium.ttf", 26)
    _shadowed(img, (0, 22), f"{_signed(points)} aura", serif, (255, 255, 255, 255), blur=14, alpha=170)
    d = ImageDraw.Draw(img)
    for k, line in enumerate(_wrap(d, (text or "").upper(), mono, w)[:2]):
        _shadowed(img, (2, 176 + k * 36), line, mono, (255, 255, 255, 230), blur=6)
    img.save(out, "PNG")


def total_tag(total: int, out: str) -> None:
    """Running total, top right under the label: a serif number, right-aligned."""
    w, h = 360, 110
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    serif = _font("InstrumentSerif_400Regular.ttf", 76)
    d = ImageDraw.Draw(img)
    v = _signed(total)
    _shadowed(img, (w - d.textlength(v, font=serif), 10), v, serif, (255, 255, 255, 255), blur=10)
    img.save(out, "PNG")


def moment_end(m: dict, out: str) -> None:
    total = int(m.get("total") or 0)
    scan_end({"score": _signed(total), "tier": m.get("tier") or "", "archetype": m.get("title") or "", "roast": m.get("caption") or m.get("verdict") or "", "name": ""}, out, kicker="KLEOS  ·  AURA CHECK", suffix="")


def render_moment(src: str, m: dict, out: str) -> None:
    dur, _ = _probe(src)
    beats = []
    for b in (m.get("lines") or [])[:6]:
        try:
            beats.append((min(_secs(b.get("t")), max(0.0, dur - 1.0)), int(b.get("points") or 0), str(b.get("text") or "")))
        except Exception:
            continue
    beats.sort(key=lambda x: x[0])
    with tempfile.TemporaryDirectory(prefix="kleos_moment_") as tmp:
        hud, end = os.path.join(tmp, "hud.png"), os.path.join(tmp, "end.png")
        scan_hud(m.get("title") or "", "", hud, label="AURA CHECK")
        moment_end(m, end)
        timed, running = [], 0
        tag0 = os.path.join(tmp, "tag_start.png")
        total_tag(0, tag0)
        first = beats[0][0] if beats else dur
        timed.append((tag0, 0, 0, 0.0, None))
        for i, (at, pts, text) in enumerate(beats):
            chip = os.path.join(tmp, f"beat{i}.png")
            beat_chip(pts, text, chip)
            nxt = beats[i + 1][0] if i + 1 < len(beats) else dur
            # A beat holds 2.8 s, or until the next one lands in its place (then it cuts, no blending).
            if nxt - at < 2.8:
                timed.append((chip, 80, 1440, at, nxt, True))
            else:
                timed.append((chip, 80, 1440, at, at + 2.8))
            running += pts
            tag = os.path.join(tmp, f"tag{i}.png")
            total_tag(running, tag)
            timed.append((tag, 0, 0, at, None))
        # the running total sits top-right, under the wordmark line
        # running total: right-aligned under the label; each new total replaces the last in place
        timed = [((it[0], W - 80 - 360, 140, *it[3:]) if os.path.basename(it[0]).startswith("tag") else it) for it in timed]
        for k, it in enumerate(timed):
            if os.path.basename(it[0]).startswith("tag"):
                nxt = next((t2[3] for t2 in timed[k + 1:] if os.path.basename(t2[0]).startswith("tag")), None)
                timed[k] = (it[0], it[1], it[2], it[3], nxt, True) if nxt is not None else it
        _render_overlay(src, out, hud, timed, end)


async def make_scan(vid: str, r: dict, kind: str = "scan") -> None:
    """Render the rated video from the kept take, then delete the take. Errors leave a marker for the poll."""
    src = scan_src(vid)
    try:
        async with _render_slots:
            await asyncio.to_thread(render_moment if kind == "moment" else render_scan, src, r, scan_out(vid))
    except Exception as e:
        print("scan render failed:", repr(e)[:300])
        open(scan_out(vid) + ".failed", "w").close()
    finally:
        try:
            os.remove(src)
        except OSError:
            pass
