"""Voice measurement. Deepgram for words + timestamps, librosa for pitch and energy.

Everything here is a measured fact. Nothing here is a judgment.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from dataclasses import dataclass, asdict, field

import httpx
import numpy as np

FILLERS = {"um", "uh", "er", "ah", "hmm", "like", "you know", "sort of", "kind of", "i mean", "basically", "literally", "actually"}
HEDGES = {"i guess", "i think", "maybe", "sort of", "kind of", "just", "a bit", "a little", "probably", "i suppose", "or something", "or whatever", "if that makes sense"}
APOLOGIES = {"sorry", "apologies", "my bad", "excuse me"}


@dataclass
class Word:
    word: str
    start: float
    end: float
    confidence: float


@dataclass
class VoiceFacts:
    duration_s: float
    transcript: str
    word_count: int
    wpm: float
    filler_count: int
    filler_per_min: float
    fillers: list[dict] = field(default_factory=list)  # {word, t}
    hedge_count: int = 0
    hedges: list[dict] = field(default_factory=list)
    apology_count: int = 0
    apologies: list[dict] = field(default_factory=list)
    pause_count: int = 0  # pauses > 0.7s
    longest_pause_s: float = 0.0
    first_word_s: float = 0.0
    sentence_count: int = 0
    upward_endings: int = 0  # sentence endings with rising pitch
    pitch_median_hz: float = 0.0
    pitch_variance: float = 0.0  # semitone std dev, proxy for monotone vs expressive
    energy_cv: float = 0.0  # coefficient of variation of RMS; consistency
    trailing_drop: bool = False  # does the clip end on a full stop or trail off
    ended_mid_sentence: bool = False

    def to_dict(self):
        return asdict(self)


def extract_wav(src: str) -> str:
    out = tempfile.mktemp(suffix=".wav")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", src, "-ac", "1", "-ar", "16000", out], check=True)
    return out


async def transcribe(wav_path: str) -> dict:
    key = os.environ["DEEPGRAM_API_KEY"]
    with open(wav_path, "rb") as f:
        data = f.read()
    last = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                r = await client.post(
                    "https://api.deepgram.com/v1/listen",
                    params={"model": "nova-3", "smart_format": "false", "punctuate": "true", "filler_words": "true", "language": "en"},
                    headers={"Authorization": f"Token {key}", "Content-Type": "audio/wav"},
                    content=data,
                )
            if r.status_code >= 500:
                raise httpx.HTTPStatusError("server error", request=r.request, response=r)
            r.raise_for_status()
            return r.json()
        except (httpx.ConnectError, httpx.ReadTimeout, httpx.HTTPStatusError) as e:
            last = e
            import asyncio
            await asyncio.sleep(0.6 * (attempt + 1))
    raise last


def _words(dg: dict) -> list[Word]:
    try:
        ws = dg["results"]["channels"][0]["alternatives"][0]["words"]
    except (KeyError, IndexError):
        return []
    return [Word(w["word"], float(w["start"]), float(w["end"]), float(w.get("confidence", 0))) for w in ws]


def _find_phrases(words: list[Word], phrases: set[str]) -> list[dict]:
    hits = []
    toks = [re.sub(r"[^a-z']", "", w.word.lower()) for w in words]
    for i, t in enumerate(toks):
        if t in phrases:
            hits.append({"word": t, "t": round(words[i].start, 2)})
        if i + 1 < len(toks):
            two = f"{t} {toks[i+1]}"
            if two in phrases:
                hits.append({"word": two, "t": round(words[i].start, 2)})
    return hits


def analyse(wav_path: str, dg: dict) -> VoiceFacts:
    import librosa

    y, sr = librosa.load(wav_path, sr=16000, mono=True)
    duration = float(len(y) / sr) if len(y) else 0.0
    words = _words(dg)
    transcript = dg.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")

    # speech span (first to last word) for an honest WPM
    if words:
        span = max(0.5, words[-1].end - words[0].start)
        wpm = len(words) / span * 60
        first_word = words[0].start
    else:
        span, wpm, first_word = duration, 0.0, duration

    fill = _find_phrases(words, FILLERS)
    hedge = _find_phrases(words, HEDGES)
    apol = _find_phrases(words, APOLOGIES)

    # pauses between words
    pauses = [(words[i + 1].start - words[i].end) for i in range(len(words) - 1)]
    long_pauses = [p for p in pauses if p > 0.7]

    # sentences from punctuation in the raw transcript, mapped onto words by count
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", transcript.strip()) if s]
    ended_mid = bool(transcript.strip()) and not transcript.strip().endswith((".", "!", "?"))

    # pitch
    f0, voiced, _ = librosa.pyin(y, fmin=65, fmax=400, sr=sr, frame_length=2048)
    times = librosa.times_like(f0, sr=sr, hop_length=512)
    f0v = f0[~np.isnan(f0)]
    pitch_median = float(np.median(f0v)) if len(f0v) else 0.0
    semis = 12 * np.log2(f0v / pitch_median) if (len(f0v) and pitch_median > 0) else np.array([])
    pitch_var = float(np.std(semis)) if len(semis) else 0.0

    # upward inflection at sentence ends: compare pitch in last 300 ms vs previous 300 ms of each sentence's final word
    upward = 0
    if words and sentences:
        # locate sentence end words by walking word counts
        idx = 0
        for s in sentences:
            n = len(s.split())
            end_i = min(len(words) - 1, idx + n - 1)
            w = words[end_i]
            idx += n
            t_end = w.end
            a = f0[(times >= t_end - 0.6) & (times < t_end - 0.3)]
            b = f0[(times >= t_end - 0.3) & (times <= t_end)]
            a = a[~np.isnan(a)]
            b = b[~np.isnan(b)]
            if len(a) >= 3 and len(b) >= 3 and np.median(b) > np.median(a) * 1.06:
                upward += 1

    # energy consistency
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    rms = rms[rms > np.percentile(rms, 20)] if len(rms) else rms
    energy_cv = float(np.std(rms) / (np.mean(rms) + 1e-9)) if len(rms) else 0.0
    # trailing drop: last 1.5s energy vs clip mean
    tail = librosa.feature.rms(y=y[-int(1.5 * sr):], frame_length=2048, hop_length=512)[0] if len(y) > 1.5 * sr else np.array([])
    trailing_drop = bool(len(tail) and np.mean(tail) < 0.45 * (np.mean(rms) + 1e-9))

    return VoiceFacts(
        duration_s=round(duration, 2),
        transcript=transcript,
        word_count=len(words),
        wpm=round(wpm, 1),
        filler_count=len(fill),
        filler_per_min=round(len(fill) / max(span, 1) * 60, 1),
        fillers=fill,
        hedge_count=len(hedge),
        hedges=hedge,
        apology_count=len(apol),
        apologies=apol,
        pause_count=len(long_pauses),
        longest_pause_s=round(max(long_pauses), 2) if long_pauses else 0.0,
        first_word_s=round(first_word, 2),
        sentence_count=len(sentences),
        upward_endings=upward,
        pitch_median_hz=round(pitch_median, 1),
        pitch_variance=round(pitch_var, 2),
        energy_cv=round(energy_cv, 2),
        trailing_drop=trailing_drop,
        ended_mid_sentence=ended_mid,
    )
