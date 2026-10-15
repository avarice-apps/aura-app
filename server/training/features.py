"""Flatten measured facts into a fixed numeric feature vector. Shared by training and inference."""
from __future__ import annotations

FEATURES = [
    # voice
    "v.wpm", "v.filler_per_min", "v.filler_count", "v.hedge_count", "v.apology_count", "v.pause_count",
    "v.longest_pause_s", "v.first_word_s", "v.sentence_count", "v.upward_ratio", "v.pitch_median_hz",
    "v.pitch_variance", "v.energy_cv", "v.trailing_drop", "v.ended_mid_sentence", "v.words_per_s",
    # presence
    "p.available", "p.eye_contact_ratio", "p.longest_contact_s", "p.contact_breaks", "p.head_motion",
    "p.blink_rate_per_min", "p.fidget_events", "p.shoulder_tilt_deg", "p.lean_forward", "p.lean_back", "p.smile_ratio",
]


def vectorise(facts: dict) -> list[float]:
    v = facts.get("voice", {}) or {}
    p = facts.get("presence", {}) or {}
    sc = max(1, v.get("sentence_count") or 0)
    dur = max(1.0, v.get("duration_s") or 1.0)
    row = {
        "v.wpm": v.get("wpm", 0),
        "v.filler_per_min": v.get("filler_per_min", 0),
        "v.filler_count": v.get("filler_count", 0),
        "v.hedge_count": v.get("hedge_count", 0),
        "v.apology_count": v.get("apology_count", 0),
        "v.pause_count": v.get("pause_count", 0),
        "v.longest_pause_s": v.get("longest_pause_s", 0),
        "v.first_word_s": v.get("first_word_s", 0),
        "v.sentence_count": v.get("sentence_count", 0),
        "v.upward_ratio": (v.get("upward_endings", 0) or 0) / sc,
        "v.pitch_median_hz": v.get("pitch_median_hz", 0),
        "v.pitch_variance": v.get("pitch_variance", 0),
        "v.energy_cv": v.get("energy_cv", 0),
        "v.trailing_drop": float(bool(v.get("trailing_drop"))),
        "v.ended_mid_sentence": float(bool(v.get("ended_mid_sentence"))),
        "v.words_per_s": (v.get("word_count", 0) or 0) / dur,
        "p.available": float(bool(p.get("available"))),
        "p.eye_contact_ratio": p.get("eye_contact_ratio", 0),
        "p.longest_contact_s": p.get("longest_contact_s", 0),
        "p.contact_breaks": p.get("contact_breaks", 0),
        "p.head_motion": p.get("head_motion", 0),
        "p.blink_rate_per_min": p.get("blink_rate_per_min", 0),
        "p.fidget_events": p.get("fidget_events", 0),
        "p.shoulder_tilt_deg": p.get("shoulder_tilt_deg", 0),
        "p.lean_forward": float(p.get("lean") == "forward"),
        "p.lean_back": float(p.get("lean") == "back"),
        "p.smile_ratio": p.get("smile_ratio", 0),
    }
    return [float(row[k] or 0) for k in FEATURES]
