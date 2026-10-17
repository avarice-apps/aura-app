"""Instrument check: does the voice pipeline measure what we say it measures?

Synthetic speech with one thing changed at a time (pace, fillers, rising endings, pauses, flat delivery) goes
through the real path (ElevenLabs TTS → wav → Deepgram → audio.analyse → lab.measures). Each pair must move the
right measure in the right direction. This checks the instrument, not perception: whether people *hear* the
difference is the rater study's job.

    cd server && set -a && . <env file> && set +a && .venv/bin/python -m evals.calibrate_voice [--voice ID] [--keep DIR]

Costs a few cents of TTS and transcription per run. Writes evals/calibration_report.json.
"""
from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
import tempfile

import httpx

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from pipeline import audio, lab  # noqa: E402

BASE = ("I moved here three years ago for a job in design. I run a small studio now, mostly furniture and a few "
        "restaurant interiors. On weekends I rebuild old bikes, which is the only time my phone stays in a drawer. "
        "I'd like to work on something bigger next year, maybe a hotel.")

FILLERS = ("So, um, I moved here, uh, three years ago for a job in design. I, um, run a small studio now, like, mostly "
           "furniture and, uh, a few restaurant interiors. On weekends I, um, rebuild old bikes, which is, like, the only "
           "time my phone stays in a drawer. I'd, uh, like to work on something bigger next year, maybe a hotel.")

RISING = ("I moved here three years ago for a job in design? I run a small studio now? Mostly furniture and a few "
          "restaurant interiors? On weekends I rebuild old bikes? It's the only time my phone stays in a drawer? "
          "I'd like to work on something bigger next year? Maybe a hotel?")

PAUSES = ("I moved here three years ago... for a job in design. [long pause] I run a small studio now... mostly furniture. "
          "[long pause] On weekends I rebuild old bikes. [long pause] It's the only time my phone stays in a drawer.")

# (name, text, speed, stability, model): stability high → flatter delivery
CASES = {
    "base": (BASE, 1.0, 0.5, "eleven_multilingual_v2"),
    "fast": (BASE, 1.2, 0.5, "eleven_multilingual_v2"),
    "slow": (BASE, 0.75, 0.5, "eleven_multilingual_v2"),
    "fillers": (FILLERS, 1.0, 0.5, "eleven_multilingual_v2"),
    "rising": (RISING, 1.0, 0.35, "eleven_v3"),
    "pauses": (PAUSES, 1.0, 0.5, "eleven_v3"),
    "flat": (BASE, 1.0, 1.0, "eleven_v3"),
    "lively": (BASE.replace("I run", "[excited] I run").replace("rebuild", "[laughs] rebuild"), 1.0, 0.0, "eleven_v3"),
}

# (case a, case b, measure key, expected sign of a − b)
CHECKS = [
    ("fast", "base", "pace", +1),
    ("slow", "base", "pace", -1),
    ("fillers", "base", "fillers", +1),
    ("rising", "base", "uptalk", +1),
    ("pauses", "base", "pause", +1),
    ("lively", "flat", "melody", +1),
    ("fading", "base", "fade", +1),
]


async def tts(client: httpx.AsyncClient, text: str, voice: str, speed: float, stability: float, model: str) -> bytes:
    settings = {"stability": stability, "similarity_boost": 0.8}
    if model != "eleven_v3":
        settings["speed"] = speed
    elif speed != 1.0:
        settings["speed"] = speed
    r = await client.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
        headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "accept": "audio/mpeg"},
        json={"text": text, "model_id": model, "voice_settings": settings},
        timeout=90,
    )
    if r.status_code >= 400 and "speed" in settings:  # some models refuse speed: retry without, record it
        settings.pop("speed")
        r = await client.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={"xi-api-key": os.environ["ELEVENLABS_API_KEY"], "accept": "audio/mpeg"},
            json={"text": text, "model_id": model, "voice_settings": settings},
            timeout=90,
        )
    r.raise_for_status()
    return r.content


def to_wav(mp3: bytes, d: str, name: str) -> str:
    src, dst = os.path.join(d, name + ".mp3"), os.path.join(d, name + ".wav")
    with open(src, "wb") as f:
        f.write(mp3)
    # a second of room tone first, as a real take would have
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "lavfi", "-t", "0.8", "-i", "anullsrc=r=16000:cl=mono",
                    "-i", src, "-filter_complex", "[1:a]aresample=16000,aformat=channel_layouts=mono[s];[0:a][s]concat=n=2:v=0:a=1",
                    "-ar", "16000", "-ac", "1", dst], check=True)
    return dst


async def run(voice: str, keep: str | None):
    d = keep or tempfile.mkdtemp(prefix="kleos_cal_")
    os.makedirs(d, exist_ok=True)
    results = {}
    async with httpx.AsyncClient() as client:
        for name, (text, speed, stab, model) in CASES.items():
            wav, cached = os.path.join(d, name + ".wav"), os.path.join(d, name + ".dg.json")
            if not (keep and os.path.exists(wav) and os.path.exists(cached)):
                wav = to_wav(await tts(client, text, voice, speed, stab, model), d, name)
                with open(cached, "w") as f:
                    json.dump(await audio.transcribe(wav), f)
            with open(cached) as f:
                dg = json.load(f)
            v = audio.analyse(wav, dg).to_dict()
            ms = {m["key"]: m for m in lab.measures(v, {"available": False})}
            results[name] = {"measures": {k: {"value": m["value"], "status": m["status"]} for k, m in ms.items()},
                             "raw": {k: v.get(k) for k in ("wpm", "filler_count", "upward_endings", "sentence_count", "longest_pause_s", "pitch_variance")}}
            print(f"{name:8s} " + "  ".join(f"{k}={m['value']}" for k, m in ms.items()))
    # Fading: TTS tags don't reliably drop the voice, so take the base take and ramp each sentence's last 0.6 s down
    # to 20% volume. Same words, same timings; only the endings fade.
    import numpy as np
    import soundfile as sf
    y, sr = sf.read(os.path.join(d, "base.wav"))
    with open(os.path.join(d, "base.dg.json")) as f:
        dg = json.load(f)
    words = audio._words(dg)
    tr = dg["results"]["channels"][0]["alternatives"][0]["transcript"]
    import re
    idx = 0
    sents = [x for x in re.split(r"(?<=[.!?])\s+", tr.strip()) if x]
    hop = int(0.02 * sr)
    for k, sent in enumerate(sents):
        start = words[min(len(words) - 1, idx)].start
        idx += len(sent.split())
        nxt = words[idx].start if idx < len(words) else len(y) / sr
        # where the voice actually stops (transcript word ends can run long or short)
        a, b = int(start * sr), int(nxt * sr)
        frames = np.array([np.sqrt(np.mean(y[i:i + hop] ** 2)) for i in range(a, max(a + hop, b - hop), hop)])
        on = np.where(frames > 0.08 * np.percentile(frames, 90))[0]
        end = (a + (on[-1] + 1) * hop) / sr if len(on) else nxt
        i1, i0 = min(int(end * sr), len(y)), int(max(0, end - 0.6) * sr)
        y[i0:i1] *= np.linspace(1.0, 0.2, i1 - i0)
    sf.write(os.path.join(d, "fading.wav"), y, sr)
    v = audio.analyse(os.path.join(d, "fading.wav"), dg).to_dict()
    ms = {m["key"]: m for m in lab.measures(v, {"available": False})}
    results["fading"] = {"measures": {k: {"value": m["value"], "status": m["status"]} for k, m in ms.items()}, "raw": {"fade_endings": v.get("fade_endings")}}
    print("fading   " + "  ".join(f"{k}={m['value']}" for k, m in ms.items()))
    checks = []
    for a, b, key, sign in CHECKS:
        va = results[a]["measures"].get(key, {}).get("value")
        vb = results[b]["measures"].get(key, {}).get("value")
        ok = va is not None and vb is not None and (va - vb) * sign > 0
        checks.append({"a": a, "b": b, "measure": key, "a_value": va, "b_value": vb, "expected": "higher" if sign > 0 else "lower", "pass": ok})
        print(f"{'PASS' if ok else 'FAIL'}  {key}: {a}={va} vs {b}={vb} (expected {a} {'higher' if sign > 0 else 'lower'})")
    out = {"voice": voice, "cases": results, "checks": checks, "passed": sum(c["pass"] for c in checks), "total": len(checks)}
    with open(os.path.join(os.path.dirname(__file__), "calibration_report.json"), "w") as f:
        json.dump(out, f, indent=1)
    return out


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", default="UgBBYS2sOqTuMpoF3BR0")
    ap.add_argument("--keep")
    a = ap.parse_args()
    r = asyncio.run(run(a.voice, a.keep))
    print(f"{r['passed']}/{r['total']} checks pass")
