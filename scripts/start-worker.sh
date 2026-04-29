#!/bin/sh
set -eu

MUSIC_JAR_PATH="${MUSIC_JAR_PATH:-/app/music/rumi-music-service-0.1.0-jar-with-dependencies.jar}"
MUSIC_PORT="${RUMI_MUSIC_SERVICE_PORT:-3025}"
LAVALINK_JAR_PATH="${LAVALINK_JAR_PATH:-/app/lavalink/Lavalink.jar}"
LAVALINK_WORKDIR="${LAVALINK_WORKDIR:-/app/lavalink}"
LAVALINK_PORT="${LAVALINK_PORT:-2333}"
LAVALINK_PASSWORD="${LAVALINK_PASSWORD:-youshallnotpass}"

cat > "${LAVALINK_WORKDIR}/application.yml" <<EOF
server:
  port: ${LAVALINK_PORT}
  address: 0.0.0.0

lavalink:
  server:
    password: "${LAVALINK_PASSWORD}"
    sources:
      youtube: false
      soundcloud: true
      bandcamp: true
      twitch: false
      vimeo: false
      http: true
      local: false
  plugins:
    - dependency: "dev.lavalink.youtube:youtube-plugin:1.17.0"
      snapshot: false
    - dependency: "com.github.topi314.lavasrc:lavasrc-plugin:4.8.1"
      snapshot: false

plugins:
  youtube:
    enabled: true
    allowSearch: true
    allowDirectVideoIds: true
    allowDirectPlaylistIds: true
    clients:
      - MUSIC
      - WEB
      - ANDROID_VR
      - WEBEMBEDDED
  lavasrc:
    providers:
      - "spotify"
      - "ytsearch:\"%ISRC%\""
      - "ytsearch:%QUERY%"
    sources:
      spotify: true
      applemusic: false
      deezer: false
      yandexmusic: false
      flowerytts: false
      ytsearch: true
    spotify:
      clientId: "${SPOTIFY_CLIENT_ID:-}"
      clientSecret: "${SPOTIFY_CLIENT_SECRET:-}"
      preferAnonymousToken: false

metrics:
  prometheus:
    enabled: false
EOF

export LAVALINK_URL="${LAVALINK_URL:-http://127.0.0.1:${LAVALINK_PORT}}"
export LAVALINK_PASSWORD="${LAVALINK_PASSWORD}"
export RUMI_MUSIC_SERVICE_URL="${RUMI_MUSIC_SERVICE_URL:-http://127.0.0.1:${MUSIC_PORT}}"
export MUSIC_READY="${MUSIC_READY:-true}"
export MUSIC_SLASH_OWNER="${MUSIC_SLASH_OWNER:-sidecar}"
export RUMI_MUSIC_REGISTER_SLASH="${RUMI_MUSIC_REGISTER_SLASH:-true}"
export RUMI_MUSIC_LISTEN_SLASH="${RUMI_MUSIC_LISTEN_SLASH:-true}"
export MUSIC_SIDECAR_ENABLED="${MUSIC_SIDECAR_ENABLED:-true}"

LAVALINK_PID=""
MUSIC_PID=""

wait_for_http() {
  url="$1"
  label="$2"
  attempts="${3:-45}"
  delay="${4:-2}"
  i=0

  while [ "$i" -lt "$attempts" ]; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "[rumi] ${label} is ready at ${url}"
      return 0
    fi
    i=$((i + 1))
    sleep "$delay"
  done

  echo "[rumi] ${label} did not become ready at ${url}"
  return 1
}

if [ -f "$LAVALINK_JAR_PATH" ]; then
  echo "[rumi] starting embedded lavalink on port ${LAVALINK_PORT}"
  (cd "$LAVALINK_WORKDIR" && java -jar "$LAVALINK_JAR_PATH") &
  LAVALINK_PID=$!
else
  echo "[rumi] lavalink jar not found at ${LAVALINK_JAR_PATH}; continuing without embedded lavalink"
fi

if [ -n "$LAVALINK_PID" ]; then
  wait_for_http "http://127.0.0.1:${LAVALINK_PORT}/version" "embedded lavalink" 60 2 || true
fi

if [ -f "$MUSIC_JAR_PATH" ]; then
  echo "[rumi] starting embedded music sidecar on port ${MUSIC_PORT}"
  java -jar "$MUSIC_JAR_PATH" &
  MUSIC_PID=$!
else
  echo "[rumi] music jar not found at ${MUSIC_JAR_PATH}; continuing without embedded music sidecar"
fi

if [ -n "$MUSIC_PID" ]; then
  wait_for_http "http://127.0.0.1:${MUSIC_PORT}/health" "embedded music sidecar" 60 2 || true
fi

cleanup() {
  if [ -n "$LAVALINK_PID" ]; then
    kill "$LAVALINK_PID" 2>/dev/null || true
  fi
  if [ -n "$MUSIC_PID" ]; then
    kill "$MUSIC_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

exec npm run start:bot-worker
