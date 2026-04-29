# Rumi Music Service

This is the separate music runtime for Rumi. It is intentionally split out from the main Node bot so voice playback, queue state, and Lavalink connectivity can be deployed independently.

## What it does

- logs into Discord with its own process
- registers the dedicated `/music` and `/spotify` slash trees
- exposes a lightweight health endpoint
- keeps Lavalink configuration separate from the main bot
- is designed around Supabase-backed persistence for music settings, queue/history, Spotify links, and resolver cache

## Current shape

This service now has a real runtime spine:

- config and env loading are real
- Discord slash command registration is real
- health endpoint is real
- in-memory queue/settings/cache/player state is real
- Spotify and Lavalink service layers exist
- Supabase schema for music persistence is declared in the main bot migrations
- Spotify OAuth link start/callback handling is wired through the music service
- deep Lavalink playback and queue restoration still need their dedicated runtime pass

That means the architecture is in place without forcing unstable voice code into the main bot.

## Slash command surface

- `/music play`
- `/music search`
- `/music queue`
- `/music nowplaying`
- `/music skip`
- `/music skipto`
- `/music pause`
- `/music resume`
- `/music stop`
- `/music leave`
- `/music volume`
- `/music seek`
- `/music loop track`
- `/music loop queue`
- `/music loop off`
- `/music shuffle`
- `/music remove`
- `/music move`
- `/music clear`
- `/music history`
- `/music stats`
- `/music lyrics`
- `/music autoplay`
- `/music filter bassboost|nightcore|vaporwave|karaoke|tremolo|vibrato|lowpass|rotation|distortion|reset`
- `/music panel`
- `/music export`
- `/music import`
- `/music settings volume|autoplay|announce|djrole|idle|restrict`
- `/spotify link|unlink|status|nowplaying|play|pause|resume|skip|previous|liked|recommendations|volume|shuffle|repeat|sync|autosync|follow|priority|resolve|cache|debug`
- `/spotify queue add|play`
- `/spotify playlist list|view|play`
- `/spotify device list|set`

## Environment

Copy `.env.example` and fill in:

- `DISCORD_TOKEN`
- `DISCORD_CLIENT_ID`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LAVALINK_URL`
- `LAVALINK_PASSWORD`
- `SPOTIFY_CLIENT_ID`
- `SPOTIFY_CLIENT_SECRET`
- `SPOTIFY_REDIRECT_URI` or a public `RUMI_MUSIC_SERVICE_PUBLIC_URL`
- `GOOGLE_API_KEY`

## Lavalink plugin setup

Rumi's music service expects a Lavalink v4 node with:

- `dev.lavalink.youtube:youtube-plugin:1.17.0`
- `com.github.topi314.lavasrc:lavasrc-plugin:4.8.1`

A ready-to-paste example is included in `application.example.yml`.

Current official docs:

- [Lavalink plugins](https://lavalink.dev/plugins.html)
- [YouTube plugin](https://github.com/lavalink-devs/youtube-source)
- [LavaSrc plugin](https://github.com/topi314/LavaSrc)

## Run

```bash
mvn package
java -jar target/rumi-music-service-0.1.0.jar
```

## Embedded sidecar mode

If you want to run this beside the main Node bot in one deploy for now:

- use the same Discord token
- keep `RUMI_MUSIC_REGISTER_SLASH=true`
- keep `RUMI_MUSIC_LISTEN_SLASH=true`
- set the main Node bot env `MUSIC_SLASH_OWNER=sidecar`

That lets the Java runtime own the rich `/music` and `/spotify` trees while the main bot still handles prefix commands and the rest of the bot surface.

## Notes

- This service expects a Lavalink v4 node.
- Spotify support is intended for search, metadata enrichment, linking, and queue resolution.
- Spotify linking now uses a real authorization-code flow with a callback at `/api/spotify/callback`.
- The redirect URI must be publicly reachable and whitelisted in the Spotify developer console.
- Entitlement or premium gating can be layered in later via `RUMI_SHARED_SECRET` and `RUMI_BOT_API_URL`.
- The canonical persistence target is Supabase, not Mongo.
- This repo targets Java 17 for local Maven/Lavalink compatibility.
