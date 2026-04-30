#!/bin/sh
set -eu

APP_ROOT="${APP_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
RUNTIME_ROOT="${RUNTIME_ROOT:-$APP_ROOT/.runtime}"
MUSIC_JAR_PATH="${MUSIC_JAR_PATH:-}"
MUSIC_PORT="${RUMI_MUSIC_SERVICE_PORT:-3025}"
LAVALINK_JAR_PATH="${LAVALINK_JAR_PATH:-}"
LAVALINK_WORKDIR="${LAVALINK_WORKDIR:-$APP_ROOT/.runtime/lavalink}"
LAVALINK_PORT="${LAVALINK_PORT:-2333}"
LAVALINK_PASSWORD="${LAVALINK_PASSWORD:-youshallnotpass}"
LAVALINK_VERSION="${LAVALINK_VERSION:-4.1.2}"
JAVA_BOOTSTRAP_ENABLED="${JAVA_BOOTSTRAP_ENABLED:-true}"
JAVA_RUNTIME_ROOT="${JAVA_RUNTIME_ROOT:-$RUNTIME_ROOT/java}"
ADOPTIUM_JDK_URL="${ADOPTIUM_JDK_URL:-https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse}"
MUSIC_BUILD_ENABLED="${MUSIC_BUILD_ENABLED:-true}"
MAVEN_VERSION="${MAVEN_VERSION:-3.9.9}"
MAVEN_RUNTIME_ROOT="${MAVEN_RUNTIME_ROOT:-$RUNTIME_ROOT/maven}"
MAVEN_DIST_URL="${MAVEN_DIST_URL:-https://archive.apache.org/dist/maven/maven-3/${MAVEN_VERSION}/binaries/apache-maven-${MAVEN_VERSION}-bin.tar.gz}"
MVN_BIN="${MVN_BIN:-}"

download_and_extract_tarball() {
  url="$1"
  target_root="$2"
  label="$3"
  archive_path="${target_root}/${label}.tar.gz"

  mkdir -p "$target_root"

  echo "[rumi] downloading ${label}"
  curl -fsSL "$url" -o "$archive_path"
  tar -xzf "$archive_path" -C "$target_root"
  rm -f "$archive_path"
}

first_child_dir() {
  root="$1"
  for path in "$root"/*; do
    if [ -d "$path" ]; then
      echo "$path"
      return 0
    fi
  done
  return 1
}

ensure_java_runtime() {
  if command -v java >/dev/null 2>&1; then
    return 0
  fi

  if [ "$JAVA_BOOTSTRAP_ENABLED" != "true" ]; then
    return 1
  fi

  existing_jdk="$(first_child_dir "$JAVA_RUNTIME_ROOT" 2>/dev/null || true)"
  if [ -n "$existing_jdk" ] && [ -x "$existing_jdk/bin/java" ]; then
    export JAVA_HOME="$existing_jdk"
    export PATH="$JAVA_HOME/bin:$PATH"
    return 0
  fi

  rm -rf "$JAVA_RUNTIME_ROOT"
  mkdir -p "$JAVA_RUNTIME_ROOT"
  download_and_extract_tarball "$ADOPTIUM_JDK_URL" "$JAVA_RUNTIME_ROOT" "temurin-jdk17"

  extracted_jdk="$(first_child_dir "$JAVA_RUNTIME_ROOT" 2>/dev/null || true)"
  if [ -n "$extracted_jdk" ] && [ -x "$extracted_jdk/bin/java" ]; then
    export JAVA_HOME="$extracted_jdk"
    export PATH="$JAVA_HOME/bin:$PATH"
    echo "[rumi] using bootstrapped java from ${JAVA_HOME}"
    return 0
  fi

  return 1
}

ensure_maven_runtime() {
  if [ -n "$MVN_BIN" ] && [ -x "$MVN_BIN" ]; then
    return 0
  fi

  if command -v mvn >/dev/null 2>&1; then
    MVN_BIN="$(command -v mvn)"
    return 0
  fi

  existing_maven="$(first_child_dir "$MAVEN_RUNTIME_ROOT" 2>/dev/null || true)"
  if [ -n "$existing_maven" ] && [ -x "$existing_maven/bin/mvn" ]; then
    MVN_BIN="$existing_maven/bin/mvn"
    export PATH="$existing_maven/bin:$PATH"
    return 0
  fi

  rm -rf "$MAVEN_RUNTIME_ROOT"
  mkdir -p "$MAVEN_RUNTIME_ROOT"
  download_and_extract_tarball "$MAVEN_DIST_URL" "$MAVEN_RUNTIME_ROOT" "apache-maven-${MAVEN_VERSION}"

  extracted_maven="$(first_child_dir "$MAVEN_RUNTIME_ROOT" 2>/dev/null || true)"
  if [ -n "$extracted_maven" ] && [ -x "$extracted_maven/bin/mvn" ]; then
    MVN_BIN="$extracted_maven/bin/mvn"
    export PATH="$extracted_maven/bin:$PATH"
    echo "[rumi] using bootstrapped maven from ${extracted_maven}"
    return 0
  fi

  return 1
}

refresh_music_jar_path() {
  if [ -n "$MUSIC_JAR_PATH" ] && [ -f "$MUSIC_JAR_PATH" ]; then
    return 0
  fi

  if [ -f "$APP_ROOT/music/rumi-music-service-0.1.0-jar-with-dependencies.jar" ]; then
    MUSIC_JAR_PATH="$APP_ROOT/music/rumi-music-service-0.1.0-jar-with-dependencies.jar"
  elif [ -f "$APP_ROOT/rumi-music-service/target/rumi-music-service-0.1.0-jar-with-dependencies.jar" ]; then
    MUSIC_JAR_PATH="$APP_ROOT/rumi-music-service/target/rumi-music-service-0.1.0-jar-with-dependencies.jar"
  else
    MUSIC_JAR_PATH="$APP_ROOT/rumi-music-service/target/rumi-music-service-0.1.0.jar"
  fi
}

ensure_music_jar() {
  refresh_music_jar_path
  if [ -f "$MUSIC_JAR_PATH" ]; then
    return 0
  fi

  if [ "$MUSIC_BUILD_ENABLED" != "true" ]; then
    return 1
  fi

  if ! ensure_java_runtime; then
    echo "[rumi] java is unavailable, so the embedded music service cannot be built"
    return 1
  fi

  if ! ensure_maven_runtime; then
    echo "[rumi] maven is unavailable, so the embedded music service cannot be built"
    return 1
  fi

  if [ ! -d "$APP_ROOT/rumi-music-service" ]; then
    echo "[rumi] music service source folder not found at $APP_ROOT/rumi-music-service"
    return 1
  fi

  echo "[rumi] music jar not found; building embedded music service from source"
  (cd "$APP_ROOT/rumi-music-service" && "$MVN_BIN" -q -DskipTests package)
  refresh_music_jar_path
  [ -f "$MUSIC_JAR_PATH" ]
}

if ! ensure_java_runtime; then
  echo "[rumi] java is not installed and could not be bootstrapped; starting the bot without embedded music"
  exec npm run start:bot-worker
fi

if [ -z "$MUSIC_JAR_PATH" ]; then
  refresh_music_jar_path
fi

if [ -z "$LAVALINK_JAR_PATH" ]; then
  if [ -f "$APP_ROOT/lavalink/Lavalink.jar" ]; then
    LAVALINK_JAR_PATH="$APP_ROOT/lavalink/Lavalink.jar"
  else
    LAVALINK_JAR_PATH="$LAVALINK_WORKDIR/Lavalink.jar"
  fi
fi

mkdir -p "$LAVALINK_WORKDIR"

ensure_music_jar || true

if [ ! -f "$LAVALINK_JAR_PATH" ]; then
  echo "[rumi] lavalink jar not found at ${LAVALINK_JAR_PATH}; downloading ${LAVALINK_VERSION}"
  curl -fsSL "https://github.com/lavalink-devs/Lavalink/releases/download/${LAVALINK_VERSION}/Lavalink.jar" \
    -o "$LAVALINK_JAR_PATH"
fi

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
