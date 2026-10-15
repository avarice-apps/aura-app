#!/usr/bin/env bash
# Install a standalone Kleos on your iPhone that talks to the Railway server.
# No Mac server, no tunnel: once installed it works anywhere. Free Apple ID builds expire after 7 days; rerun to refresh.
# Usage: npm run phone            (uses AURA_PUBLIC_URL from server/.env.railway)
#        npm run phone -- https://your-server
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
say() { printf "\n\033[1;34m▸ %s\033[0m\n" "$1"; }
die() { printf "\n\033[1;31m✗ %s\033[0m\n" "$1"; exit 1; }

URL="${1:-}"
if [ -z "$URL" ] && [ -f "$ROOT/server/.env.railway" ]; then
  URL=$(grep -E '^AURA_PUBLIC_URL=' "$ROOT/server/.env.railway" | cut -d= -f2- | tr -d '"' || true)
fi
[ -n "$URL" ] || die "No server URL. Run: npm run phone -- https://your-app.up.railway.app"
URL="${URL%/}"

say "Checking the server at $URL"
curl -sf "$URL/health" >/dev/null || die "The server isn't answering at $URL/health. Check the Railway deploy logs."
echo "  server is up"

cd "$ROOT"
if [ ! -d node_modules ] || [ package.json -nt node_modules ]; then
  say "Installing app packages"
  npm install
  touch node_modules
fi
if [ -d ios ] && { [ app.json -nt ios ] || [ package.json -nt ios ]; }; then
  say "Native settings changed. Regenerating the iOS project"
  rm -rf ios
fi

say "Building Kleos onto your iPhone (Release, ~10 min first time). Keep it plugged in and unlocked."
EXPO_PUBLIC_API_URL="$URL" EXPO_PUBLIC_TEST_UNLOCK=1 npx expo run:ios --device --configuration Release
say "Done. Open Kleos on your phone. You can unplug it; it talks to $URL directly."
