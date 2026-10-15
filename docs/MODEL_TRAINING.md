# Training Aura's own model

Claude writes Poise's words. The **judgment** (how a man comes across) is Aura's own model, trained on how real people perceive real clips. That model and its data are the moat.

## The pieces (all in the repo)

| Piece | Where | What it does |
|---|---|---|
| Consent | Onboarding step "Help train Poise's eye"; toggle in You → Your data | Separate, optional, explicit (BIPA-grade). Saying no changes nothing. Turning it off withdraws all clips. |
| Collection | `server/main.py` `/read` with `train_consent=1` | Saves the clip, measured facts and rubric scores under an anonymous subject id. |
| Panel tool | `/rate?token=…` (`server/training/rate.html`) | Raters must watch ≥85% of the clip, then rate six perceptions 1–7. Least-rated clips are served first; each clip stops at 3 ratings. |
| Rater links | `POST /train/raters` (admin key) | One private link per rater. |
| Training | `python -m training.train` | Rater reliability → weighted targets → one gradient-boosted model per perception → 5-fold CV metrics → `models/perception.joblib`. |
| Inference | `server/training/learned.py` | Learned scores blend into the rubric only once they earn it: no weight below CV Spearman 0.35, rising to 70% at 0.70. |
| Retention | `POST /train/purge`, `purge_training()` | Training clips deleted after 12 months. |

## The six perceptions

Confident · Warm · Nervous · Clear · Trust · Engage (want to keep listening). Perceptions, never diagnoses: Aura does not claim to detect anxiety or any condition.

## Running a panel

1. Deploy the server with `AURA_ADMIN_KEY` set.
2. Create rater links: `curl -X POST $HOST/train/raters -F label=Prolific-01 -F admin_key=$KEY`.
3. Recruit raters (Prolific is the standard; US, 18+, fluent English). Pay ~$0.25–0.35 per clip. 1,000 clips × 3 ratings ≈ $900.
4. Progress: `curl "$HOST/train/stats?admin_key=$KEY"`.
5. Train once ≥60 clips have 2+ ratings (useful at ~500, good at ~1,000): `cd server && python -m training.train`.
6. Restart the server. It loads `models/perception.joblib` automatically, and each Read response then includes `perceived`.

Dry run with no data: `python -m training.train --synthetic 600`. On simulated data it recovers the hidden patterns (CV ρ 0.60–0.84). The synthetic model is never loaded by the server.

## Roadmap

1. **Now → 1,000 rated clips:** this model, on 27 measured features. Replaces hand-set rubric weights with learned ones.
2. **5k–20k clips:** multimodal model on raw audio embeddings (WavLM) and face-landmark sequences; one rented GPU. Finds patterns the hand-built features miss.
3. **Outcome labels:** which drills raised next week's scores. A model of what *improves* people.

## Data rules

- Opted-in users only. Never scraped video, never strangers.
- Research datasets with non-commercial licences: prototype only, never ship.
- Raters stream clips, cannot download, and agree not to share.
