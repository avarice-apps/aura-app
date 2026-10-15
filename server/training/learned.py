"""Blend the learned perception model into the rubric.

The hand-set rubric is the prior. The learned model earns weight in proportion to how well it
predicted held-out panel ratings (CV Spearman). Under rho 0.35 it gets no weight at all.
Only the real model (models/perception.joblib) is ever loaded at inference, never the synthetic one.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache

from .features import vectorise

MODELS = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")

# how panel perceptions map onto Aura's axes (1–7 scale → 0–100)
AXIS_FROM_DIMS = {
    "voice": {"clear": 0.5, "warm": 0.3, "engage": 0.2},
    "presence": {"confident": 0.4, "engage": 0.35, "trust": 0.25},
    "command": {"confident": 0.5, "trust": 0.5},
    "composure": {"nervous": -1.0},
}


@lru_cache(maxsize=1)
def _load():
    path = os.path.join(MODELS, "perception.joblib")
    mpath = os.path.join(MODELS, "perception_metrics.json")
    if not (os.path.exists(path) and os.path.exists(mpath)):
        return None
    import joblib

    bundle = joblib.load(path)
    with open(mpath) as f:
        metrics = json.load(f)
    return bundle, metrics


def _to100(x: float) -> float:
    return (x - 1) / 6 * 100


def perception(facts: dict) -> dict | None:
    got = _load()
    if not got:
        return None
    bundle, _ = got
    X = [vectorise(facts)]
    return {d: float(bundle["models"][d].predict(X)[0]) for d in bundle["dims"]}


def blend(axes: dict, facts: dict) -> tuple[dict, dict | None]:
    """Returns (blended axes, perception dims or None)."""
    got = _load()
    if not got:
        return axes, None
    _, metrics = got
    dims = perception(facts)
    out = dict(axes)
    for axis, mix in AXIS_FROM_DIMS.items():
        rhos = [metrics["dims"][d]["cv_spearman"] for d in mix]
        rho = min(rhos)
        w = 0.0 if rho < 0.35 else min(0.7, (rho - 0.35) * 2)  # 0 → 0.7 as rho goes 0.35 → 0.70
        if w == 0:
            continue
        learned = 0.0
        for d, k in mix.items():
            v = _to100(dims[d])
            learned += abs(k) * (100 - v if k < 0 else v)
        learned /= sum(abs(k) for k in mix.values())
        out[axis] = int(round((1 - w) * axes[axis] + w * learned))
    return out, dims
