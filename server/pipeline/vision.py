"""Things Poise reads from pictures: a clip of someone's moment (Rate a Clip) and an Instagram profile (Profile Read).

Rules for both: judge behaviour, choices and presentation, never bodies, faces' attractiveness, race, or anything a person
can't change. Never identify real people. Anything involving a minor, violence or someone in distress is declined kindly.
"""
from __future__ import annotations

import asyncio
import base64
import os
import subprocess
import tempfile

from . import audio
from .converse import M_EVAL, _json_call

GUARD = """Hard rules: judge behaviour, words, timing, choices and presentation only. Never rate or comment on attractiveness, bodies, weight, skin, race, ethnicity, disability, sexuality or anything a person can't change. Never try to identify who anyone is. If anyone appears to be under 18, or the clip shows violence, injury, sexual content or someone in real distress, return {"declined": true, "reason": str} and nothing else."""

MOMENT_SYSTEM = """You are Poise, inside Kleos. Someone uploaded a short clip of a social moment (theirs or someone else's) and wants it rated for aura: what was gained or lost, beat by beat, like a referee's replay.
""" + GUARD + """
You get frames in order with timestamps, and the transcript of what was said.
Return only JSON:
{"title": str (<= 6 words, the moment, e.g. 'The fumbled toast'),
 "verdict": str (one line, <= 16 words, the honest call),
 "lines": [{"t": str (e.g. '0:04'), "text": str (<= 10 words, what happened), "points": int}] (3-6 beats),
 "total": int (sum of points),
 "tier": one of "Aura farmed"|"Aura positive"|"Neutral"|"Aura debt"|"Aura bankruptcy",
 "caption": str (one quotable line for TikTok, <= 14 words),
 "what_to_do": str (what would have saved it, one sentence),
 "said_instead": str or null (one line the person could have said, natural, <= 20 words)}
Points are on the meme scale: small beats +-20..80, big ones +-150..500. Be honest. If it was a fumble, the total is negative."""

PROFILE_SYSTEM = """You are Poise, inside Kleos. Someone uploaded screenshots of an Instagram profile (theirs, usually) and wants to know its aura: what a stranger concludes in five seconds as a visitor, and how to fix it.
""" + GUARD + """
Judge: profile picture (framing, light, setting, expression and vibe, not looks), name and bio (clarity, voice, try-hard or not), grid as a whole (cohesion, variety, effort that shows vs effort that's visible), and captions (voice, cringe, specificity). If something isn't visible in the screenshots, say so instead of guessing.
Return only JSON:
{"score": int (0-100, honest: most profiles are 40-65),
 "tier": str (<= 3 words, playful, e.g. 'Quiet money', 'LinkedIn energy', 'Main character', 'Witness protection'),
 "first_impression": str (what a stranger concludes in five seconds, one sentence, blunt),
 "parts": [{"part": "Profile picture"|"Bio"|"Grid"|"Captions"|"Highlights", "score": int, "note": str (<= 22 words), "fix": str (<= 18 words)}],
 "bio_rewrite": str or null (a better bio in his voice, <= 80 characters),
 "caption_rewrite": {"before": str, "after": str} or null,
 "fixes": [str, str, str] (the three changes that move the score most, in order),
 "song": {"title": str, "artist": str, "why": str (<= 14 words)} (a real, well-known song that matches the profile's current vibe)}"""


def _frames(video: str, n: int = 6) -> list[tuple[float, bytes]]:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", video], capture_output=True, text=True)
    try:
        dur = float(out.stdout.strip())
    except ValueError:
        dur = 10.0
    tmp = tempfile.mkdtemp(prefix="kleos_frames_")
    frames = []
    for i in range(n):
        t = dur * (i + 0.5) / n
        path = os.path.join(tmp, f"f{i}.jpg")
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{t:.2f}", "-i", video, "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "4", path], check=False)
        if os.path.exists(path):
            frames.append((t, open(path, "rb").read()))
    return frames


def _img(b: bytes, media: str = "image/jpeg") -> dict:
    return {"type": "image", "source": {"type": "base64", "media_type": media, "data": base64.b64encode(b).decode()}}


async def rate_moment(video: str, note: str = "", tone: str = "real") -> dict:
    frames = await asyncio.to_thread(_frames, video)
    words = ""
    try:
        wav = video + ".wav"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", video, "-ac", "1", "-ar", "16000", wav], check=True)
        dg = await audio.transcribe(wav)
        words = (dg.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "") or "").strip()
    except Exception:
        pass
    blocks: list[dict] = []
    for t, b in frames:
        blocks.append({"type": "text", "text": f"Frame at {int(t // 60)}:{int(t % 60):02d}"})
        blocks.append(_img(b))
    blocks.append({"type": "text", "text": f"Transcript: {words or '(no clear speech)'}\nUploader's note: {note or '(none)'}"})
    sys_ = MOMENT_SYSTEM + (UNFILTERED if tone == "unfiltered" else "\nVoice: blunt, funny, no swearing.")

    def check(o):
        if o.get("declined"):
            return None
        if not o.get("lines"):
            return "need lines"
        return None

    return await _json_call(M_EVAL, sys_, blocks, max_tokens=1500, check=check, allow_slang=True)


async def read_profile(images: list[tuple[bytes, str]], handle: str = "", tone: str = "real") -> dict:
    blocks: list[dict] = [_img(b, m) for b, m in images[:6]]
    blocks.append({"type": "text", "text": f"Handle (if given): {handle or '(not given)'}. These are screenshots of the profile as a visitor sees it."})
    sys_ = PROFILE_SYSTEM + (UNFILTERED if tone == "unfiltered" else "\nVoice: blunt, funny, no swearing.")

    def check(o):
        if o.get("declined"):
            return None
        if not isinstance(o.get("score"), (int, float)) or not o.get("parts"):
            return "need score and parts"
        return None

    return await _json_call(M_EVAL, sys_, blocks, max_tokens=1800, check=check, allow_slang=True)


UNFILTERED = "\nVoice: UNFILTERED. Brutal and funny, like the friend reacting on camera. Swear when it's earned. Call a fumble a fumble. Roast choices, never looks or identity."
