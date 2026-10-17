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
    # --- disfluency (stutter-adjacent, measured not diagnosed)
    repeat_count: int = 0  # immediate word/bigram repeats: "I I", "the the", "so so"
    repeats: list[dict] = field(default_factory=list)  # {word, t}
    restart_count: int = 0  # abandoned clause restarted within a beat
    restarts: list[dict] = field(default_factory=list)  # {from, to, t}
    prolongation_count: int = 0  # short words held far longer than the speaker's norm
    prolongations: list[dict] = field(default_factory=list)  # {word, t, dur}
    # --- pace dynamics
    rate_cv: float = 0.0  # coefficient of variation of per-sentence wpm
    rush_moments: list[dict] = field(default_factory=list)  # {t, wpm, text}
    slow_moments: list[dict] = field(default_factory=list)
    # --- tone dynamics
    pitch_range_st: float = 0.0  # 5th-95th percentile pitch range in semitones
    flat_stretch_s: float = 0.0  # longest stretch of near-monotone voiced speech
    fade_endings: int = 0  # sentences whose last half-second drops to a murmur
    loud_cv: float = 0.0  # loudness variation across sentences
    # --- per-sentence timeline (the raw material for cross-signal moments)
    timeline: list[dict] = field(default_factory=list)  # {i, t0, t1, text, wpm, tone_st, loud, ends_up, fades}
    signal_moments: list[dict] = field(default_factory=list)  # {t, kind, detail}

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


# "like" is a filler only when it isn't doing a job: "I'd like to", "you like it", "looks like rain" are words, not filler.
_LIKE_KEEPS_BEFORE = {"i", "you", "we", "they", "he", "she", "i'd", "you'd", "we'd", "they'd", "would", "to", "don't", "didn't",
                      "doesn't", "really", "feel", "feels", "felt", "look", "looks", "looked", "seem", "seems", "sound", "sounds",
                      "something", "nothing", "anything", "just", "much", "more", "most", "who", "people", "kids", "also"}
_LIKE_KEEPS_AFTER = {"to", "it", "this", "that", "them", "him", "her", "me", "us", "you", "a", "an", "the", "my", "your", "our", "their", "his"}


def _filler_like(toks: list[str], i: int) -> bool:
    before = toks[i - 1] if i else ""
    after = toks[i + 1] if i + 1 < len(toks) else ""
    if before in _LIKE_KEEPS_BEFORE or after in _LIKE_KEEPS_AFTER:
        return False
    return True


def _find_phrases(words: list[Word], phrases: set[str]) -> list[dict]:
    hits = []
    toks = [re.sub(r"[^a-z']", "", w.word.lower()) for w in words]
    for i, t in enumerate(toks):
        if t == "like" and "like" in phrases and not _filler_like(toks, i):
            continue
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
    upward_idx: set[int] = set()
    if words and sentences:
        # locate sentence end words by walking word counts
        idx = 0
        for si, s in enumerate(sentences):
            n = len(s.split())
            end_i = min(len(words) - 1, idx + n - 1)
            w = words[end_i]
            idx += n
            # the last word's own voiced frames vs the two words before it (word timings, not a fixed window, so
            # a short final word or Deepgram padding the end with silence doesn't hide the rise)
            prev_i = max(idx - n, end_i - 2)
            a = f0[(times >= words[prev_i].start) & (times < w.start)]
            b = f0[(times >= w.start) & (times <= w.end + 0.15)]
            a = a[~np.isnan(a)]
            b = b[~np.isnan(b)][-4:]  # the last voiced frames of the final word
            # 3.5 semitones up from the words before: tuned on evals/calibrate_voice.py (questions read as statements
            # rose 4–14 st; plain statements stayed under 3.5 bar one)
            if len(a) >= 3 and len(b) >= 2 and 12 * np.log2(np.median(b) / np.median(a)) > 3.5:
                upward += 1
                upward_idx.add(si)

    # energy consistency
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    rms = rms[rms > np.percentile(rms, 20)] if len(rms) else rms
    energy_cv = float(np.std(rms) / (np.mean(rms) + 1e-9)) if len(rms) else 0.0
    # trailing drop: last 1.5s energy vs clip mean
    tail = librosa.feature.rms(y=y[-int(1.5 * sr):], frame_length=2048, hop_length=512)[0] if len(y) > 1.5 * sr else np.array([])
    trailing_drop = bool(len(tail) and np.mean(tail) < 0.45 * (np.mean(rms) + 1e-9))


    # ---- per-sentence spans (walk word counts; punctuation lives in the transcript)
    spans = []
    if words and sentences:
        idx = 0
        for si, sent in enumerate(sentences):
            n = max(1, len(sent.split()))
            lo, hi = min(idx, len(words) - 1), min(len(words) - 1, idx + n - 1)
            idx += n
            spans.append((si, words[lo].start, words[hi].end, sent, hi - lo + 1))

    # ---- disfluency
    repeats, restarts, prolong = [], [], []
    norm = [re.sub(r"[^a-z']", "", w.word.lower()) for w in words]
    for i in range(1, len(words)):
        if norm[i] and norm[i] == norm[i - 1] and words[i].start - words[i - 1].end < 0.6:
            repeats.append({"word": norm[i], "t": round(words[i].start, 2)})
        elif i >= 3 and norm[i] == norm[i - 2] and norm[i - 1] == norm[i - 3] and words[i - 1].start - words[i - 2].end < 0.6:
            repeats.append({"word": f"{norm[i-1]} {norm[i]}", "t": round(words[i - 1].start, 2)})
    # restart: a clause opener ("i", "so", "we", "it", "the") recurs within 4 words after a micro-pause
    OPENERS = {"i", "so", "we", "it", "the", "and", "my", "you", "there"}
    for i in range(1, len(words)):
        gap = words[i].start - words[i - 1].end
        if 0.25 <= gap < 1.2 and norm[i] in OPENERS:
            back = norm[max(0, i - 4):i]
            if norm[i] in back and not (norm[i] == norm[i - 1]):
                restarts.append({"from": " ".join(w.word for w in words[max(0, i - 4):i]), "to": " ".join(w.word for w in words[i:i + 3]), "t": round(words[i].start, 2)})
    durs = np.array([w.end - w.start for w in words]) if words else np.array([])
    if len(durs) >= 8:
        med = float(np.median(durs))
        for w, d in zip(words, durs):
            if len(w.word) <= 4 and d > max(0.75, 2.6 * med):
                prolong.append({"word": w.word, "t": round(w.start, 2), "dur": round(float(d), 2)})

    # ---- pace dynamics
    rates = []
    for si, t0, t1, text, n in spans:
        if t1 - t0 >= 0.8 and n >= 3:
            rates.append((si, n / (t1 - t0) * 60, t0, text))
    rate_cv = 0.0
    rush, slow = [], []
    if len(rates) >= 2:
        r = np.array([x[1] for x in rates])
        rate_cv = float(np.std(r) / (np.mean(r) + 1e-9))
        medr = float(np.median(r))
        for si, wpm_s, t0, text in rates:
            if wpm_s > 1.28 * medr and wpm_s > 170:
                rush.append({"t": round(t0, 2), "wpm": round(wpm_s), "text": text[:80]})
            elif wpm_s < 0.7 * medr and wpm_s < 110:
                slow.append({"t": round(t0, 2), "wpm": round(wpm_s), "text": text[:80]})

    # ---- tone dynamics
    pitch_range = float(np.percentile(semis, 95) - np.percentile(semis, 5)) if len(semis) >= 10 else 0.0
    flat = 0.0
    if len(f0) > 10:
        hop_s = 512 / sr
        run = best = 0
        win = int(1.0 / hop_s)
        for k in range(0, len(f0) - win, win // 2 or 1):
            seg = f0[k:k + win]
            seg = seg[~np.isnan(seg)]
            if len(seg) >= win * 0.5 and np.std(12 * np.log2(seg / (np.median(seg) + 1e-9))) < 0.9:
                run += win // 2 or 1
                best = max(best, run)
            else:
                run = 0
        flat = round(best * hop_s, 1)
    rms_full = librosa.feature.rms(y=y, frame_length=2048, hop_length=512)[0]
    rms_t = librosa.times_like(rms_full, sr=sr, hop_length=512)
    rms_mean = float(np.mean(rms_full)) + 1e-9
    timeline, fades, louds = [], 0, []
    for si, t0, t1, text, n in spans:
        seg = rms_full[(rms_t >= t0) & (rms_t <= t1)]
        loud = float(np.mean(seg) / rms_mean) if len(seg) else 1.0
        # compare the last ~0.4 s of *voiced* frames with the sentence's voiced level; the silence a transcript
        # pads onto the last word, and the normal drop of a final consonant, shouldn't count as fading out
        fade = False
        if len(seg) > 8:
            seg_t = rms_t[(rms_t >= t0) & (rms_t <= t1)]
            on = seg > 0.08 * np.percentile(seg, 90)  # low enough that a real fade stays in; true silence drops out
            voiced, voiced_t = seg[on], seg_t[on]
            if len(voiced) > 8:
                tail = voiced[voiced_t >= voiced_t[-1] - 0.4]
                fade = bool(len(tail) >= 3 and np.mean(tail) < 0.45 * np.mean(voiced))
        fades += int(fade)
        louds.append(loud)
        tone = f0[(times >= t0) & (times <= t1)]
        tone = tone[~np.isnan(tone)]
        tone_st = float(np.median(12 * np.log2(tone / (pitch_median + 1e-9)))) if (len(tone) and pitch_median > 0) else 0.0
        wpm_s = n / max(0.5, t1 - t0) * 60
        timeline.append({"i": si + 1, "t0": round(t0, 1), "t1": round(t1, 1), "text": text[:90], "wpm": round(wpm_s), "tone_st": round(tone_st, 1), "loud": round(loud, 2), "ends_up": si in upward_idx, "fades": fade})
    loud_cv = float(np.std(louds) / (np.mean(louds) + 1e-9)) if len(louds) >= 2 else 0.0

    # ---- signal moments: one flat list, time-ordered, for the evaluator to cross-reference
    moments = []
    moments += [{"t": x["t"], "kind": "filler", "detail": x["word"]} for x in fill]
    moments += [{"t": x["t"], "kind": "hedge", "detail": x["word"]} for x in hedge]
    moments += [{"t": x["t"], "kind": "apology", "detail": x["word"]} for x in apol]
    moments += [{"t": x["t"], "kind": "repeat", "detail": x["word"]} for x in repeats]
    moments += [{"t": x["t"], "kind": "restart", "detail": f"{x['from']} -> {x['to']}"} for x in restarts]
    moments += [{"t": x["t"], "kind": "prolongation", "detail": f"{x['word']} held {x['dur']}s"} for x in prolong]
    moments += [{"t": x["t"], "kind": "rush", "detail": f"{x['wpm']} wpm"} for x in rush]
    moments += [{"t": x["t"], "kind": "slow", "detail": f"{x['wpm']} wpm"} for x in slow]
    moments += [{"t": s_["t1"], "kind": "fade", "detail": s_["text"][-40:]} for s_ in timeline if s_["fades"]]
    for i in range(len(words) - 1):
        g = words[i + 1].start - words[i].end
        if g > 1.2:
            moments.append({"t": round(words[i].end, 2), "kind": "pause", "detail": f"{g:.1f}s after '{words[i].word}'"})
    moments.sort(key=lambda m: m["t"])

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
        repeat_count=len(repeats),
        repeats=repeats[:12],
        restart_count=len(restarts),
        restarts=restarts[:8],
        prolongation_count=len(prolong),
        prolongations=prolong[:8],
        rate_cv=round(rate_cv, 2),
        rush_moments=rush[:6],
        slow_moments=slow[:6],
        pitch_range_st=round(pitch_range, 1),
        flat_stretch_s=flat,
        fade_endings=fades,
        loud_cv=round(loud_cv, 2),
        timeline=timeline[:24],
        signal_moments=moments[:40],
    )


def quick_facts(dg: dict, duration: float) -> VoiceFacts:
    """Word-level facts only (no audio DSP). Milliseconds, so the character can reply right away.

    The full analyse() runs in the background and replaces these before evaluation.
    """
    words = _words(dg)
    transcript = dg.get("results", {}).get("channels", [{}])[0].get("alternatives", [{}])[0].get("transcript", "")
    if words:
        span = max(0.5, words[-1].end - words[0].start)
        wpm = len(words) / span * 60
        first_word = words[0].start
    else:
        span, wpm, first_word = duration, 0.0, duration
    fill = _find_phrases(words, FILLERS)
    hedge = _find_phrases(words, HEDGES)
    apol = _find_phrases(words, APOLOGIES)
    pauses = [(words[i + 1].start - words[i].end) for i in range(len(words) - 1)]
    long_pauses = [p for p in pauses if p > 0.7]
    norm = [re.sub(r"[^a-z']", "", w.word.lower()) for w in words]
    repeats = [{"word": norm[i], "t": round(words[i].start, 2)} for i in range(1, len(words)) if norm[i] and norm[i] == norm[i - 1] and words[i].start - words[i - 1].end < 0.6]
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", transcript.strip()) if s]
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
        ended_mid_sentence=bool(transcript.strip()) and not transcript.strip().endswith((".", "!", "?")),
        repeat_count=len(repeats),
        repeats=repeats[:12],
    )


def duration_of(wav_path: str) -> float:
    import soundfile as sf

    info = sf.info(wav_path)
    return float(info.frames / info.samplerate) if info.samplerate else 0.0
