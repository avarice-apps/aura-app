"""Anchored rubric: facts → axis scores (0–100). Deterministic. Cannot be charmed.

Each axis starts at a base and is moved by anchored penalties and credits.
Weights live here so they can be tuned without touching the model prompt.
"""
from __future__ import annotations

from .audio import VoiceFacts
from .face import PresenceFacts

AXIS_WEIGHT = {"voice": 0.25, "presence": 0.25, "command": 0.20, "composure": 0.15, "read": 0.15}


def clamp(x: float, lo: float = 5, hi: float = 97) -> int:
    return int(round(max(lo, min(hi, x))))


def voice_score(v: VoiceFacts) -> int:
    s = 72.0
    # fillers per minute: 0–2 fine, 6+ costly
    s -= min(35.0, max(0.0, v.filler_per_min - 2) * 4.5)
    # pace: 130–165 wpm is the band; outside costs
    if v.wpm:
        if v.wpm > 175:
            s -= (v.wpm - 175) * 0.35
        elif v.wpm < 115:
            s -= (115 - v.wpm) * 0.3
    # upward endings
    if v.sentence_count:
        s -= (v.upward_endings / v.sentence_count) * 22
    # monotone vs expressive: semitone std < 1.2 is flat; > 4 is erratic
    if v.pitch_variance:
        if v.pitch_variance < 1.2:
            s -= (1.2 - v.pitch_variance) * 12
        elif v.pitch_variance > 4.0:
            s -= (v.pitch_variance - 4.0) * 5
    # energy consistency
    s -= max(0.0, v.energy_cv - 0.6) * 15
    if v.trailing_drop:
        s -= 6
    return clamp(s)


def presence_score(p: PresenceFacts) -> int:
    if not p.available:
        return 50  # unknown; wide band handles this upstream
    s = 40.0 + p.eye_contact_ratio * 50
    s -= min(p.contact_breaks, 12) * 1.5
    s -= min(p.fidget_events, 8) * 2.5
    s -= max(0.0, p.head_motion - 0.04) * 120
    if p.blink_rate_per_min > 28:
        s -= (p.blink_rate_per_min - 28) * 0.5
    if p.shoulder_tilt_deg > 6:
        s -= (p.shoulder_tilt_deg - 6) * 1.2
    if p.lean == "back":
        s -= 5
    return clamp(s)


def command_score(v: VoiceFacts) -> int:
    s = 70.0
    s -= min(v.hedge_count, 10) * 4
    s -= min(v.apology_count, 5) * 7
    if v.ended_mid_sentence:
        s -= 10
    if v.word_count and v.duration_s:
        # thin content: very few words for the time
        density = v.word_count / max(v.duration_s, 1)
        if density < 1.6:
            s -= (1.6 - density) * 15
    if v.sentence_count >= 3:
        s += 4
    return clamp(s)


def composure_score(v: VoiceFacts) -> int:
    s = 68.0
    s -= max(0.0, v.first_word_s - 1.2) * 8
    s -= min(v.pause_count, 8) * 2.5
    s -= max(0.0, v.longest_pause_s - 1.5) * 6
    return clamp(s)


def band_for(n_reads: int, presence_available: bool) -> int:
    base = {0: 12, 1: 9, 2: 7, 3: 6}.get(n_reads, 5)
    return base + (3 if not presence_available else 0)


def score(v: VoiceFacts, p: PresenceFacts, read_axis: int | None, n_prior_reads: int) -> dict:
    axes = {
        "voice": voice_score(v),
        "presence": presence_score(p),
        "command": command_score(v),
        "composure": composure_score(v),
        "read": read_axis if read_axis is not None else 50,
    }
    index = round(sum(axes[k] * w for k, w in AXIS_WEIGHT.items()))
    return {"axes": axes, "index": index, "band": band_for(n_prior_reads, p.available)}
