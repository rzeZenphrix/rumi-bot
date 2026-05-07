#!/bin/sh
set -eu

echo "[rumi] starting bot worker without Java/Lavalink music sidecars"

export ENABLE_API="${ENABLE_API:-false}"
export BOT_MODE="${BOT_MODE:-single}"
export NO_SHARDS="${NO_SHARDS:-true}"
export MUSIC_BACKEND="${MUSIC_BACKEND:-node}"
export NODE_MUSIC_ENABLED="${NODE_MUSIC_ENABLED:-true}"
export MUSIC_READY="${MUSIC_READY:-true}"
export MUSIC_SIDECAR_ENABLED="false"
export RUMI_MUSIC_REGISTER_SLASH="${RUMI_MUSIC_REGISTER_SLASH:-false}"
export RUMI_MUSIC_LISTEN_SLASH="${RUMI_MUSIC_LISTEN_SLASH:-false}"

exec npm run start:bot-worker
