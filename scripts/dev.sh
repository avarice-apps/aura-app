#!/usr/bin/env bash
# One command to run Aura end to end on your Mac: tunnel + AI server + app.
#   npm run dev
# Ctrl+C stops everything.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOGS="$ROOT/.dev-logs"
mkdir -p "$LOGS"

say() { printf "\n\033[1;34m▸ %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m✕ %s\033[0m\n" "$1"; exit 1; }

command -v cloudflared >/dev/null || die "cloudflared not installed. Run: brew install cloudflared"
[ -f "$ROOT/server/.env" ] || die "Missing server/.env (your API keys). Move aura.env there: mv ~/Downloads/aura.env $ROOT/server/.env"
[ -d "$ROOT/server/.venv" ] || die "Server not set up. Run: cd $ROOT/server && python3.12 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt"
[ -f "$ROOT/server/models/face_landmarker.task" ] || {
  say "Downloading face and posture models (one time)"
  mkdir -p "$ROOT/server/models"
  curl -sSL -o "$ROOT/server/models/face_landmarker.task" https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  curl -sSL -o "$ROOT/server/models/pose_landmarker_lite.task" https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task
}

PIDS=()
cleanup() {
  for p in "${PIDS[@]:-}"; do kill "$p" 2>/dev/null || true; done
  printf "\nStopped tunnel and server.\n"
}
trap cleanup EXIT INT TERM

# Free the port if an old server is still running
lsof -ti tcp:8787 2>/dev/null | xargs kill 2>/dev/null || true

say "Starting tunnel"
: > "$LOGS/tunnel.log"
cloudflared tunnel --url http://localhost:8787 > "$LOGS/tunnel.log" 2>&1 &
PIDS+=($!)
URL=""
for _ in $(seq 1 40); do
  URL=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOGS/tunnel.log" | head -1 || true)
  [ -n "$URL" ] && break
  sleep 0.5
done
[ -n "$URL" ] || die "Tunnel didn't start. See $LOGS/tunnel.log"
echo "  $URL"

say "Starting AI server"
(
  cd "$ROOT/server"
  # shellcheck disable=SC1091
  source .venv/bin/activate
  set -a; source .env; set +a
  export AURA_PUBLIC_URL="$URL"
  exec uvicorn main:app --host 0.0.0.0 --port 8787
) > "$LOGS/server.log" 2>&1 &
PIDS+=($!)
for _ in $(seq 1 60); do
  curl -sf http://localhost:8787/health >/dev/null 2>&1 && break
  sleep 0.5
done
curl -sf http://localhost:8787/health >/dev/null 2>&1 || die "Server didn't start. See $LOGS/server.log"
echo "  ready (logs: .dev-logs/server.log)"

cd "$ROOT"
if [ "${1:-}" = "build" ] || [ ! -d "$ROOT/ios" ]; then
  if [ "${1:-}" = "build" ]; then
    say "Building Kleos onto your iPhone (first time ~10 min). Keep it plugged in and unlocked."
    EXPO_PUBLIC_API_URL="$URL" npx expo run:ios --device
    exit 0
  fi
fi
if [ -d "$ROOT/ios" ]; then
  say "Starting the app. Open Kleos on your iPhone (or scan the QR code)."
else
  say "Starting the app in Expo Go (turn-based voice). For live voice run: npm run build"
fi
EXPO_PUBLIC_API_URL="$URL" npx expo start --tunnel -c
