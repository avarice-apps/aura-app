# Aura

How you come across. Measured. Poise reads your voice, eyes and words, tells you the three things costing you, and trains them out.

- `docs/PRODUCT_SYSTEM.md` — the whole product: measurement, scoring, tiers, modes, Poise's rules, retention, pricing, build order.
- `docs/DESIGN_DIRECTION.md` — cobalt, engraving, sculpture; tokens, type, motion.
- `src/` — Expo app (iOS first).
- `server/` — Python API: Deepgram + librosa + MediaPipe → rubric → Claude (Poise) → ElevenLabs.
- `supabase/` — schema.

## Run the app

```bash
npm install --legacy-peer-deps
npx expo start            # Expo Go works for everything except camera video on some devices; use a dev build for the Read
```

Offline mode: with no `EXPO_PUBLIC_API_URL` set, the app returns a sample verdict so every screen can be reviewed without the server.

Dev build (needed for Skia, camera recording, haptics on device):

```bash
npm i -g eas-cli && eas login
eas build --profile development --platform ios
```

## Run the server

```bash
cd server
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt
mkdir -p models && curl -sSL -o models/face_landmarker.task https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task \
  && curl -sSL -o models/pose_landmarker_lite.task https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
cp .env.example .env   # fill in the keys; never commit .env
set -a; . .env; set +a
uvicorn main:app --port 8787
```

Then point the app at it: `EXPO_PUBLIC_API_URL=http://<your-lan-ip>:8787 npx expo start`.

Endpoints: `POST /read` (video + prompt → verdict JSON with audio URL), `POST /pressure` (audio → composure), `POST /silence` (video → presence), `GET /tts?text=`.

Deploy: the `Dockerfile` runs on Fly.io or Railway as is. A Read takes 20–40 s on one shared CPU; MediaPipe is the slow part. Set `AURA_PUBLIC_URL` to the public host so audio URLs resolve.

## Keys

Keys live in environment variables only. The three pasted in chat during setup should be rotated before launch and given spend limits.

## Status

Built and verified locally on 2026-10-14:
- App bundles (`expo export`), typechecks, all screens wired with motion.
- Server runs a real Read end to end on a test clip: transcript with timestamps, fillers/hedges/apologies, pitch and energy, face and pose, rubric scores, Poise verdict passing the consistency guard, spoken by ElevenLabs.

Next: Supabase auth + persistence in the app, RevenueCat, PostHog, Sunday push, TestFlight.
