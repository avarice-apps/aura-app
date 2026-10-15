"""Train Aura's perception model: measured facts → how a panel of people perceived the speaker.

    python -m training.train            # trains on real ratings in the training store
    python -m training.train --synthetic 600   # dry run on simulated data to check the plumbing

Steps
1. Rater reliability: each rater's leave-one-out correlation with the other raters on shared clips.
   Raters below 0.2 are dropped; the rest are weighted by reliability.
2. Targets: reliability-weighted mean rating per clip per dimension (needs >= 2 ratings).
3. Model: one gradient-boosted regressor per dimension, 5-fold CV. Reports R² and Spearman.
4. Ship: writes models/perception.joblib + models/perception_metrics.json.
   The server blends learned scores into the rubric with a weight earned by CV performance (see learned.py).
"""
from __future__ import annotations

import argparse
import json
import os
from collections import defaultdict

import joblib
import numpy as np
from scipy.stats import spearmanr
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.model_selection import KFold, cross_val_predict
from sklearn.metrics import r2_score

from .features import FEATURES, vectorise
from .store import DIMENSIONS, export_rows

OUT = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models")
MIN_RATINGS = 2
MIN_CLIPS = 60


def rater_reliability(ratings: list[dict]) -> dict[str, float]:
    by_clip = defaultdict(list)
    for r in ratings:
        by_clip[r["clip_id"]].append(r)
    xs, ys = defaultdict(list), defaultdict(list)
    for clip, rs in by_clip.items():
        if len(rs) < 2:
            continue
        for r in rs:
            others = [o for o in rs if o["rater_id"] != r["rater_id"]]
            d = json.loads(r["dims"])
            od = [json.loads(o["dims"]) for o in others]
            for k in DIMENSIONS:
                xs[r["rater_id"]].append(d[k])
                ys[r["rater_id"]].append(np.mean([o[k] for o in od]))
    rel = {}
    for rid in xs:
        if len(xs[rid]) >= 12 and np.std(xs[rid]) > 0:
            rel[rid] = float(np.corrcoef(xs[rid], ys[rid])[0, 1])
        else:
            rel[rid] = 0.5  # not enough overlap yet: neutral weight
    return rel


def targets(clips: dict, ratings: list[dict], rel: dict[str, float]):
    by_clip = defaultdict(list)
    for r in ratings:
        w = rel.get(r["rater_id"], 0.5)
        if w < 0.2:
            continue
        by_clip[r["clip_id"]].append((w, json.loads(r["dims"])))
    X, Y, ids = [], [], []
    for cid, rs in by_clip.items():
        if len(rs) < MIN_RATINGS or cid not in clips:
            continue
        ws = np.array([w for w, _ in rs])
        y = [float(np.average([d[k] for _, d in rs], weights=ws)) for k in DIMENSIONS]
        X.append(vectorise(json.loads(clips[cid]["features"])))
        Y.append(y)
        ids.append(cid)
    return np.array(X), np.array(Y), ids


def synthetic(n: int, seed: int = 7):
    """Simulated clips + noisy raters, so the pipeline can be tested before real data exists."""
    rng = np.random.default_rng(seed)
    clips, ratings = {}, []
    raters = [f"r{i}" for i in range(12)]
    noise = {r: (0.6 if i < 10 else 2.5) for i, r in enumerate(raters)}  # two bad raters
    for i in range(n):
        fillers = rng.gamma(2, 2.5)
        eye = rng.beta(4, 2)
        upward = rng.beta(2, 5)
        fidget = rng.poisson(4)
        pitchv = rng.normal(2.5, 0.8)
        wpm = rng.normal(150, 22)
        facts = {
            "voice": {"wpm": wpm, "filler_per_min": fillers, "filler_count": fillers / 2, "hedge_count": rng.poisson(3), "apology_count": rng.poisson(0.6),
                      "pause_count": rng.poisson(2), "longest_pause_s": rng.gamma(2, 0.5), "first_word_s": rng.gamma(2, 0.5), "sentence_count": 8,
                      "upward_endings": upward * 8, "pitch_median_hz": rng.normal(120, 15), "pitch_variance": pitchv, "energy_cv": rng.normal(0.6, 0.15),
                      "trailing_drop": rng.random() < 0.2, "ended_mid_sentence": rng.random() < 0.15, "word_count": wpm / 2, "duration_s": 30},
            "presence": {"available": True, "eye_contact_ratio": eye, "longest_contact_s": eye * 10, "contact_breaks": rng.poisson(4), "head_motion": rng.gamma(2, 0.02),
                         "blink_rate_per_min": rng.normal(18, 5), "fidget_events": fidget, "shoulder_tilt_deg": rng.gamma(2, 2), "lean": "neutral", "smile_ratio": rng.beta(2, 5)},
        }
        latent = {
            "confident": 5.5 - 0.25 * fillers + 2.0 * eye - 2.5 * upward,
            "warm": 4.0 + 0.4 * pitchv + 2.0 * facts["presence"]["smile_ratio"],
            "nervous": 2.5 + 0.25 * fillers + 0.15 * fidget - 1.5 * eye,
            "clear": 5.5 - 0.2 * fillers - abs(wpm - 150) / 30,
            "trust": 4.5 + 1.5 * eye - 1.5 * upward - 0.1 * fidget,
            "engage": 3.5 + 0.35 * pitchv + 1.2 * eye - 0.12 * fillers,
        }
        cid = f"s{i}"
        clips[cid] = {"id": cid, "features": json.dumps(facts)}
        for r in rng.choice(raters, 3, replace=False):
            dims = {k: int(np.clip(round(v + rng.normal(0, noise[r])), 1, 7)) for k, v in latent.items()}
            ratings.append({"clip_id": cid, "rater_id": r, "dims": json.dumps(dims)})
    return clips, ratings


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--synthetic", type=int, default=0)
    ap.add_argument("--out", default=OUT)
    a = ap.parse_args()

    clips, ratings = synthetic(a.synthetic) if a.synthetic else export_rows()
    rel = rater_reliability(ratings)
    X, Y, ids = targets(clips, ratings, rel)
    print(f"clips usable: {len(ids)} · raters: {len(rel)} · dropped raters: {[r for r, v in rel.items() if v < 0.2]}")
    if len(ids) < MIN_CLIPS:
        print(f"Need at least {MIN_CLIPS} clips with {MIN_RATINGS}+ ratings. Have {len(ids)}. Keep collecting.")
        return

    models, metrics = {}, {"n_clips": len(ids), "features": FEATURES, "dims": {}, "synthetic": bool(a.synthetic)}
    kf = KFold(5, shuffle=True, random_state=0)
    for j, dim in enumerate(DIMENSIONS):
        m = HistGradientBoostingRegressor(max_depth=3, learning_rate=0.06, max_iter=300, l2_regularization=1.0, min_samples_leaf=12)
        pred = cross_val_predict(m, X, Y[:, j], cv=kf)
        r2 = float(r2_score(Y[:, j], pred))
        rho = float(spearmanr(Y[:, j], pred).statistic)
        m.fit(X, Y[:, j])
        models[dim] = m
        metrics["dims"][dim] = {"cv_r2": round(r2, 3), "cv_spearman": round(rho, 3)}
        print(f"{dim:10s}  R² {r2:5.2f}   ρ {rho:5.2f}")

    os.makedirs(a.out, exist_ok=True)
    name = "perception_synthetic" if a.synthetic else "perception"
    joblib.dump({"models": models, "features": FEATURES, "dims": list(DIMENSIONS)}, os.path.join(a.out, f"{name}.joblib"))
    with open(os.path.join(a.out, f"{name}_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"saved {name}.joblib")


if __name__ == "__main__":
    main()
