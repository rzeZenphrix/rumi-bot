const { ChannelType } = require('discord.js');
const { Player, QueueRepeatMode, QueryType } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
const musicUi = require('./musicUiV2');

process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';

const logger = require('../logging/logger');
const db = require('../../services/database');
const emojis = require('../../utils/botEmojis');

let ffmpegPath = process.env.FFMPEG_PATH || null;

try {
  const ffmpegStatic = require('ffmpeg-static');
  const ffmpeg = require('fluent-ffmpeg');

  if (!ffmpegPath && ffmpegStatic) ffmpegPath = ffmpegStatic;
  if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);

  logger.info({ ffmpegPath }, 'Music FFmpeg path configured');
} catch (error) {
  logger.warn({ error }, 'Music FFmpeg path could not be configured');
}

const INVISIBLE = '\u200B';

const FILTER_ALIASES = new Map([
  ['off', 'off'],
  ['clear', 'off'],
  ['none', 'off'],
  ['disable', 'off'],
  ['disabled', 'off'],
  ['8d', '8D'],
  ['rotation', '8D'],
  ['rotate', '8D'],
  ['bass', 'bassboost'],
  ['bassboost', 'bassboost'],
  ['bassboost_low', 'bassboost_low'],
  ['bassboost_high', 'bassboost_high'],
  ['nightcore', 'nightcore'],
  ['vaporwave', 'vaporwave'],
  ['lofi', 'lofi'],
  ['karaoke', 'karaoke'],
  ['tremolo', 'tremolo'],
  ['vibrato', 'vibrato'],
  ['phaser', 'phaser'],
  ['subboost', 'subboost'],
  ['treble', 'treble'],
  ['normalizer', 'normalizer'],
  ['normalizer2', 'normalizer2'],
  ['surrounding', 'surrounding'],
  ['pulsator', 'pulsator'],
  ['mono', 'mono'],
  ['reverse', 'reverse'],
  ['flanger', 'flanger'],
  ['chorus', 'chorus'],
  ['compressor', 'compressor']
]);

let player = null;
let clientRef = null;
let extractorLoadPromise = null;

function icon(name, fallback = '') {
  return emojis[name] || emojis[`music_${name}`] || fallback;
}

const MUSIC_EMOJIS = musicUi.MUSIC_EMOJIS;

const ICONS = {
  play: MUSIC_EMOJIS.play,
  pause: MUSIC_EMOJIS.pause,
  x: MUSIC_EMOJIS.stop,
  stop: MUSIC_EMOJIS.stop,
  skip: MUSIC_EMOJIS.forward,
  forward: MUSIC_EMOJIS.forward,
  backward: MUSIC_EMOJIS.backward,
  queue: MUSIC_EMOJIS.play,
  search: MUSIC_EMOJIS.play,
  good: MUSIC_EMOJIS.play,
  bad: MUSIC_EMOJIS.stop,
  volume: MUSIC_EMOJIS.play,
  loop: MUSIC_EMOJIS.forward,
  filter: MUSIC_EMOJIS.play,
  settings: MUSIC_EMOJIS.play,
  arrow: MUSIC_EMOJIS.forward
};

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function workerLog(label, data = {}) {
  console.log(`[rumi-music-worker:nodePlayer] ${label}`, data);
}

function isNodeMusicEnabled() {
  const backend = String(process.env.MUSIC_BACKEND || '').trim().toLowerCase();
  if (backend) return backend === 'node';
  return envFlag('NODE_MUSIC_ENABLED', true);
}

async function getMusicSettings(guildId) {
  return db.getKv(`music:settings:${guildId}`, 'config', {
    stay247: false,
    defaultVolume: Number(process.env.MUSIC_DEFAULT_VOLUME || 65),
    searchEngine: String(process.env.MUSIC_SEARCH_ENGINE || 'soundcloud').toLowerCase()
  });
}

async function saveMusicSettings(guildId, patch = {}) {
  const current = await getMusicSettings(guildId).catch(() => ({
    stay247: false,
    defaultVolume: Number(process.env.MUSIC_DEFAULT_VOLUME || 65),
    searchEngine: 'soundcloud'
  }));

  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  await db.setKv(`music:settings:${guildId}`, 'config', next).catch(() => null);
  return next;
}

function truncate(value, max = 1024) {
  const text = String(value ?? '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function escapeMarkdown(value) {
  return String(value ?? '').replace(/([\\`*_{}[\]()#+\-.!|>~])/g, '\\$1');
}

function escapeLinkLabel(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
}

function cleanPayload(payload) {
  const next = { ...payload };

  for (const key of Object.keys(next)) {
    if (next[key] === undefined || next[key] === null) delete next[key];
    if (Array.isArray(next[key]) && !next[key].length) delete next[key];
  }

  delete next.title;
  delete next.color;

  return next;
}

function toThumbnail(url) {
  return url ? { url } : undefined;
}

function toFooter(text, iconUrl = null) {
  if (!text) return undefined;

  const footer = {
    text: truncate(text, 200)
  };

  if (iconUrl) footer.icon_url = iconUrl;
  return footer;
}

function avatarUrl(user) {
  if (!user) return null;
  if (typeof user.displayAvatarURL === 'function') return user.displayAvatarURL({ size: 128 });
  if (typeof user.avatarURL === 'function') return user.avatarURL({ size: 128 });
  return null;
}

function userLabel(user) {
  if (!user) return null;
  return user.globalName || user.username || user.tag || user.id || null;
}

function ok(description, extra = {}) {
  return cleanPayload({
    ok: true,
    replyType: 'good',
    description: truncate(description, 4096),
    ...extra
  });
}

function panel(description, extra = {}) {
  return cleanPayload({
    ok: true,
    replyType: 'info',
    description: truncate(description, 4096),
    ...extra
  });
}

function fail(error, detail, code = 'music_node_error') {
  return cleanPayload({
    ok: false,
    code,
    error,
    detail,
    replyType: 'bad',
    description: `**${escapeMarkdown(error)}**\n${escapeMarkdown(detail)}`
  });
}

function trackTitle(track) {
  return track?.title || track?.cleanTitle || track?.raw?.title || 'Unknown track';
}

function trackAuthor(track) {
  return track?.author || track?.raw?.author || track?.raw?.artist || null;
}

function trackUrl(track) {
  return track?.url || track?.raw?.url || null;
}

function trackSource(track) {
  const raw = String(
    track?.source ||
    track?.raw?.source ||
    track?.extractor?.identifier ||
    track?.extractor?.protocols?.[0] ||
    ''
  ).toLowerCase();

  if (raw.includes('soundcloud')) return 'SoundCloud';
  if (raw.includes('spotify')) return 'Spotify';
  if (raw.includes('apple')) return 'Apple Music';
  if (raw.includes('vimeo')) return 'Vimeo';
  if (raw.includes('reverbnation')) return 'ReverbNation';
  if (raw.includes('attachment')) return 'Attachment';
  if (raw.includes('arbitrary')) return 'Direct link';
  if (raw.includes('youtube')) return 'YouTube';

  return raw || 'Music';
}

function formatTrack(track, compact = false) {
  if (!track) return 'Nothing playing.';

  const title = truncate(trackTitle(track), compact ? 70 : 100);
  const author = trackAuthor(track);
  const url = trackUrl(track);

  const label = url
    ? `[${escapeLinkLabel(title)}](${url})`
    : `**${escapeMarkdown(title)}**`;

  if (compact) {
    return author ? `${label} — ${escapeMarkdown(author)}` : label;
  }

  return author
    ? `${label}\n${escapeMarkdown(author)}`
    : label;
}

function trackData(track) {
  if (!track) return null;

  return {
    title: trackTitle(track),
    author: trackAuthor(track),
    url: trackUrl(track),
    thumbnail: track.thumbnail || null,
    duration: trackDuration(track),
    source: trackSource(track)
  };
}

function msToDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function durationStringToMs(value) {
  const raw = String(value || '').trim();
  if (!raw || /live|unknown/i.test(raw)) return null;
  if (!/^\d{1,2}(:\d{1,2}){1,2}$/.test(raw)) return null;

  const parts = raw.split(':').map(Number);
  const seconds = parts.pop() || 0;
  const minutes = parts.pop() || 0;
  const hours = parts.pop() || 0;

  return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
}

function trackDuration(track) {
  if (!track) return 'Unknown';

  const raw = String(track.duration || '').trim();

  if (raw && !['0:00', '00:00'].includes(raw)) {
    if (/live/i.test(raw)) return 'Live';
    return raw;
  }

  if (track.durationMS) return msToDuration(track.durationMS);
  if (track.live || track.raw?.isLive) return 'Live';

  return 'Unknown';
}

function parseDuration(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return null;

  if (/^\d+$/.test(value)) return Number(value) * 1000;

  if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(value)) {
    const parsed = durationStringToMs(value);
    return parsed === null ? null : parsed;
  }

  const matches = [...value.matchAll(/(\d+)\s*(h|hr|hrs|hour|hours|m|min|mins|minute|minutes|s|sec|secs|second|seconds)/g)];
  if (!matches.length) return null;

  return matches.reduce((total, match) => {
    const amount = Number(match[1]);
    const unit = match[2][0];

    if (unit === 'h') return total + amount * 3600000;
    if (unit === 'm') return total + amount * 60000;
    return total + amount * 1000;
  }, 0);
}

function oneBasedIndex(raw) {
  const index = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(index) && index > 0 ? index - 1 : null;
}

function queueTracks(queue) {
  const tracks = queue?.tracks;
  if (!tracks) return [];
  if (Array.isArray(tracks)) return tracks;
  if (typeof tracks.toArray === 'function') return tracks.toArray();
  if (typeof tracks.toJSON === 'function') return tracks.toJSON();
  if (tracks.store && typeof tracks.store.values === 'function') return [...tracks.store.values()];

  try {
    return [...tracks];
  } catch {
    return [];
  }
}

function getQueue(guildId) {
  if (!player || !guildId) return null;
  return player.nodes?.get?.(guildId) || player.queues?.get?.(guildId) || null;
}

async function ensurePlayback(queue, track = null) {
  if (!queue || queue.deleted) {
    return {
      ok: false,
      reason: 'Queue does not exist or was deleted.'
    };
  }

  try {
    workerLog('ensurePlayback:start', {
      hasQueue: Boolean(queue),
      deleted: Boolean(queue.deleted),
      currentTrack: trackTitle(queue.currentTrack || track),
      isPlaying: queue.node?.isPlaying?.(),
      isPaused: queue.node?.isPaused?.(),
      isBuffering: queue.node?.isBuffering?.()
    });

    if (queue.node?.isPaused?.()) {
      queue.node.resume();
    }

    if (queue.node?.isPlaying?.() || queue.node?.isBuffering?.()) {
      return {
        ok: true,
        state: 'already_playing'
      };
    }

    if (typeof queue.connect === 'function') {
      await queue.connect(queue.channel).catch(() => null);
    }

    if (typeof queue.node?.play === 'function') {
      try {
        await queue.node.play(track || undefined);
      } catch (_firstError) {
        await queue.node.play().catch((error) => {
          throw error;
        });
      }

      return {
        ok: true,
        state: 'forced_play'
      };
    }

    return {
      ok: false,
      reason: 'Queue node has no play function.'
    };
  } catch (error) {
    return {
      ok: false,
      reason: error.message || 'Playback force-start failed.'
    };
  }
}

function repeatModeName(mode) {
  if (mode === QueueRepeatMode.TRACK) return 'Track';
  if (mode === QueueRepeatMode.QUEUE) return 'Queue';
  if (mode === QueueRepeatMode.AUTOPLAY) return 'Autoplay';
  return 'Off';
}

function playbackState(queue) {
  if (!queue) return 'Idle';
  if (queue.node?.isPaused?.()) return 'Paused';
  if (queue.node?.isBuffering?.()) return 'Buffering';
  if (queue.node?.isPlaying?.()) return 'Playing';
  return 'Ready';
}

function progressLine(queue) {
  const track = queue?.currentTrack;
  if (!queue || !track) return '`──────────────────` 0:00 / 0:00';

  const timestamp = queue.node?.getTimestamp?.();
  const current = Number(timestamp?.current?.value || 0);
  const total =
    Number(timestamp?.total?.value || 0) ||
    Number(track.durationMS || 0) ||
    durationStringToMs(track.duration);

  const duration = trackDuration(track);

  if (!total || !Number.isFinite(total) || /live/i.test(duration)) {
    return `\`${msToDuration(current)} elapsed\` · Live`;
  }

  const width = 18;
  const ratio = Math.max(0, Math.min(1, current / total));
  const marker = Math.min(width - 1, Math.round(ratio * (width - 1)));
  const bar = `${'─'.repeat(marker)}●${'─'.repeat(width - marker - 1)}`;

  return `\`${bar}\` ${msToDuration(current)} / ${msToDuration(total)}`;
}

function queueCount(queue) {
  return queueTracks(queue).length;
}

function activeFilters(queue) {
  const current = queue?.filters?.ffmpeg?.filters || [];
  return current.length ? current.join(', ') : 'off';
}

function compactFooter(queue, user = null, extra = []) {
  const parts = [];

  if (queue) {
    parts.push(`${queueCount(queue)} waiting`);
    parts.push(`${queue.node?.volume ?? 100}%`);
    parts.push(`Loop ${repeatModeName(queue.repeatMode)}`);
  }

  for (const item of extra) {
    if (item) parts.push(item);
  }

  const prefix = user ? `Requested by ${userLabel(user)}` : 'Rumi music';
  return `${prefix}${parts.length ? ` · ${parts.join(' · ')}` : ''}`;
}

function queueLine(track, index) {
  const title = truncate(trackTitle(track), 60);
  const duration = trackDuration(track);
  const url = trackUrl(track);

  const label = url
    ? `[${escapeLinkLabel(title)}](${url})`
    : escapeMarkdown(title);

  return `\`${String(index + 1).padStart(2, '0')}\` ${label} \`${duration}\``;
}

function fitLines(lines, max = 1800) {
  const output = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + 1;
    if (nextLength > max) break;
    output.push(line);
    length = nextLength;
  }

  return output.join('\n');
}

function isUrl(query) {
  return /^https?:\/\//i.test(String(query || '').trim());
}

function isYoutubeUrl(query) {
  return /(?:youtube\.com|youtu\.be|music\.youtube\.com)/i.test(String(query || ''));
}

function searchEngineName(engine) {
  const raw = String(engine || '').toLowerCase();

  if (raw === 'spotify') return 'Spotify';
  if (raw === 'apple' || raw === 'applemusic') return 'Apple Music';
  if (raw === 'auto') return 'Auto';

  return 'SoundCloud';
}

function preferredSearchEngine(query, settings = {}) {
  if (isUrl(query)) return QueryType.AUTO;

  const engine = String(settings.searchEngine || process.env.MUSIC_SEARCH_ENGINE || 'soundcloud')
    .trim()
    .toLowerCase();

  if (engine === 'spotify') return QueryType.SPOTIFY_SEARCH;
  if (engine === 'apple' || engine === 'applemusic') return QueryType.APPLE_MUSIC_SEARCH || QueryType.AUTO_SEARCH;
  if (engine === 'auto') return QueryType.AUTO_SEARCH;

  return QueryType.SOUNDCLOUD_SEARCH;
}

function normalizeFilterName(mode) {
  const raw = String(mode || '').trim();
  if (!raw) return '';
  return FILTER_ALIASES.get(raw) || FILTER_ALIASES.get(raw.toLowerCase()) || raw;
}

async function setAudioFilter(queue, mode) {
  if (envFlag('MUSIC_DISABLE_FILTERS', true)) {
    return {
      error: fail(
        'Audio filters are disabled.',
        'Filters can cause buffering on small hosts. Set `MUSIC_DISABLE_FILTERS=false` only when the host is strong enough.',
        'music_filters_disabled'
      )
    };
  }

  const ffmpeg = queue?.filters?.ffmpeg;

  if (!ffmpeg?.setFilters) {
    return {
      error: fail(
        'Audio filters are unavailable.',
        'FFmpeg filters are not available in this runtime.',
        'music_filters_unavailable'
      )
    };
  }

  const filter = normalizeFilterName(mode);

  if (!filter || filter === 'off') {
    await ffmpeg.setFilters([]);
    return { filter: 'off' };
  }

  if (ffmpeg.isValidFilter && !ffmpeg.isValidFilter(filter)) {
    return {
      error: fail(
        'Unknown audio filter.',
        'Try bassboost, nightcore, vaporwave, lofi, 8d, tremolo, vibrato, mono, or off.',
        'music_unknown_filter'
      )
    };
  }

  await ffmpeg.setFilters([filter]);
  return { filter };
}

async function resolveContext(guildId, options = {}) {
  if (!clientRef) {
    return {
      error: fail(
        'Music is still starting.',
        'Try again in a few seconds.',
        'music_not_initialized'
      )
    };
  }

  const guild = clientRef.guilds.cache.get(guildId) || await clientRef.guilds.fetch(guildId).catch(() => null);

  if (!guild) {
    return {
      error: fail(
        'I could not find that server.',
        'The music request had an invalid guild ID.',
        'music_invalid_guild'
      )
    };
  }

  const voiceChannel = options.voiceChannelId
    ? guild.channels.cache.get(options.voiceChannelId) || await guild.channels.fetch(options.voiceChannelId).catch(() => null)
    : null;

  const textChannel = options.textChannelId
    ? guild.channels.cache.get(options.textChannelId) || await guild.channels.fetch(options.textChannelId).catch(() => null)
    : null;

  const user = options.userId
    ? clientRef.users.cache.get(options.userId) || await clientRef.users.fetch(options.userId).catch(() => null)
    : null;

  return { guild, voiceChannel, textChannel, user };
}

function voiceChannelError(voiceChannel) {
  if (!voiceChannel) {
    return fail(
      'Join a voice channel first.',
      'I need to know where to play music.',
      'music_no_voice_channel'
    );
  }

  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(voiceChannel.type)) {
    return fail(
      'That is not a playable voice channel.',
      'Join a voice or stage channel first.',
      'music_invalid_voice_channel'
    );
  }

  const me = voiceChannel.guild.members.me;
  const permissions = me ? voiceChannel.permissionsFor(me) : null;

  if (permissions && (!permissions.has('Connect') || !permissions.has('Speak'))) {
    return fail(
      'I cannot play in that voice channel.',
      'I need Connect and Speak permissions.',
      'music_missing_voice_permissions'
    );
  }

  return null;
}

function requireQueue(guildId) {
  const queue = getQueue(guildId);

  if (!queue || queue.deleted) {
    return {
      error: fail(
        'Nothing is playing.',
        'Start something with `play <song or URL>` first.',
        'music_no_queue'
      )
    };
  }

  return { queue };
}

async function loadExtractors() {
  if (!player) return;
  if (extractorLoadPromise) return extractorLoadPromise;

  extractorLoadPromise = (async () => {
    await player.extractors.loadMulti(DefaultExtractors).catch((error) => {
      logger.warn({ error }, 'Default music extractors failed to load');
    });

    const loaded = [];

    try {
      for (const extractor of player.extractors.store?.values?.() || []) {
        loaded.push(extractor.identifier || extractor.constructor?.name || 'unknown');
      }
    } catch {
      // ignore listing errors
    }

    logger.info(
      {
        extractors: player.extractors?.size || 0,
        loaded
      },
      'Music extractors loaded'
    );
  })();

  return extractorLoadPromise;
}

async function initializeMusicPlayer(client) {
  if (!isNodeMusicEnabled()) {
    logger.info('Node music backend is disabled.');
    return null;
  }

  if (player) return player;

  clientRef = client;

  player.events.on('playerStart', (queue, track) => {
    workerLog('playerStart', {
      guildId: queue?.guild?.id,
      title: trackTitle(track),
      source: trackSource(track),
      voiceChannelId: queue?.channel?.id || queue?.connection?.channel?.id || null
    });
  });

  player.events.on('connection', (queue) => {
    workerLog('connection', {
      guildId: queue?.guild?.id,
      voiceChannelId: queue?.channel?.id || queue?.connection?.channel?.id || null
    });
  });

  player.events.on('error', (queue, error) => {
    workerLog('queue error', {
      guildId: queue?.guild?.id,
      message: error?.message,
      stack: error?.stack
    });
  });

  player.events.on('playerError', (queue, error) => {
    workerLog('player error', {
      guildId: queue?.guild?.id,
      message: error?.message,
      stack: error?.stack
    });
  });

  player = new Player(client, {
    ytdlOptions: {
      quality: 'highestaudio',
      highWaterMark: 1 << 27,
      dlChunkSize: 0,
      liveBuffer: 4900
    },
    skipFFmpeg: false,
    connectionTimeout: Number(process.env.MUSIC_VOICE_CONNECTION_TIMEOUT_MS || 45000)
  });

  client.rumiMusicPlayer = player;

  player.events.on('playerStart', (queue, track) => {
    logger.info(
      {
        guildId: queue?.guild?.id,
        title: trackTitle(track),
        source: trackSource(track)
      },
      'Music playback started'
    );

    const channel = queue.metadata?.channel;
    if (!channel?.send || !envFlag('MUSIC_ANNOUNCE_TRACKS', false)) return;

    const requestedBy = track?.requestedBy || queue.metadata?.requestedBy || null;

    channel.send({
      embeds: [
        {
          description: [
            `${ICONS.play} \`now playing\``,
            formatTrack(track),
            progressLine(queue)
          ].join('\n'),
          thumbnail: toThumbnail(track?.thumbnail),
          footer: toFooter(
            compactFooter(queue, requestedBy, [trackSource(track)]),
            avatarUrl(requestedBy)
          )
        }
      ]
    }).catch(() => null);
  });

  player.events.on('audioTrackAdd', (queue, track) => {
    logger.info(
      {
        guildId: queue?.guild?.id,
        title: trackTitle(track),
        source: trackSource(track)
      },
      'Music track added'
    );
  });

  player.events.on('emptyQueue', (queue) => {
    logger.info({ guildId: queue?.guild?.id }, 'Music queue ended');
  });

  player.events.on('disconnect', (queue) => {
    logger.info({ guildId: queue?.guild?.id }, 'Music disconnected');
  });

  player.events.on('error', (queue, error) => {
    logger.warn({ guildId: queue?.guild?.id, error }, 'Music queue error');
  });

  player.events.on('playerError', (queue, error) => {
    logger.warn({ guildId: queue?.guild?.id, error }, 'Music player error');
  });

  await loadExtractors();

  logger.info(
    {
      extractors: player.extractors?.size || 0,
      ffmpegPath: ffmpegPath || null,
      searchEngine: process.env.MUSIC_SEARCH_ENGINE || 'soundcloud'
    },
    'Node music backend is ready'
  );

  return player;
}

async function health() {
  return {
    ok: Boolean(player),
    backend: 'node',
    ready: Boolean(player),
    extractors: player?.extractors?.size || 0,
    ffmpegPath: ffmpegPath || null,
    searchEngine: process.env.MUSIC_SEARCH_ENGINE || 'soundcloud',
    filtersDisabled: envFlag('MUSIC_DISABLE_FILTERS', true)
  };
}

async function getState(guildId) {
  const queue = getQueue(guildId);
  const settings = await getMusicSettings(guildId).catch(() => null);

  if (!queue) {
    return panel('Nothing is currently playing.', {
      footer: toFooter(`Node backend · Search ${searchEngineName(settings?.searchEngine)} · 24/7 ${settings?.stay247 ? 'on' : 'off'}`),
      v2: musicUi.musicNotice({
        label: 'Music status',
        title: 'Idle',
        detail: 'Nothing is currently playing.',
        status: `Node backend · Search ${searchEngineName(settings?.searchEngine)} · 24/7 ${settings?.stay247 ? 'on' : 'off'}`
      })
    });
  }

  return panel([
    `${playbackState(queue).toLowerCase()}`,
    formatTrack(queue.currentTrack),
    progressLine(queue)
  ].join('\n'), {
    thumbnail: toThumbnail(queue.currentTrack?.thumbnail),
    footer: toFooter(compactFooter(queue, null, [
      `Filters ${activeFilters(queue)}`,
      trackSource(queue.currentTrack)
    ])),
    v2: musicUi.trackCard({
      eyebrow: playbackState(queue),
      title: trackTitle(queue.currentTrack),
      artist: trackAuthor(queue.currentTrack),
      url: trackUrl(queue.currentTrack),
      thumbnail: queue.currentTrack?.thumbnail,
      metaLine: progressLine(queue).replace(/`/g, ''),
      footer: compactFooter(queue, null, [
        `Filters ${activeFilters(queue)}`,
        trackSource(queue.currentTrack)
      ])
    })
  });
}

async function play(guildId, options = {}) {
  await loadExtractors();

  const query = String(options.query || '').trim();

  if (!query) {
    return fail(
      'Tell me what to play.',
      'Use `play <song name or URL>`.',
      'music_missing_query'
    );
  }

  if (isYoutubeUrl(query) && envFlag('MUSIC_BLOCK_YOUTUBE', true)) {
    return fail(
      'YouTube playback is disabled.',
      'Use SoundCloud search, Spotify/Apple links, Vimeo links, or direct audio links.',
      'music_youtube_disabled'
    );
  }

  const context = await resolveContext(guildId, options);
  if (context.error) return context.error;

  const voiceError = voiceChannelError(context.voiceChannel);
  if (voiceError) return voiceError;

  try {
    const settings = await getMusicSettings(guildId).catch(() => ({
      stay247: false,
      defaultVolume: Number(process.env.MUSIC_DEFAULT_VOLUME || 65),
      searchEngine: 'soundcloud'
    }));

    const searchEngine = preferredSearchEngine(query, settings);
    const stay247 = Boolean(settings.stay247);

    logger.info(
      {
        guildId,
        query,
        voiceChannelId: context.voiceChannel.id,
        searchEngine,
        ffmpegPath: ffmpegPath || null
      },
      'Music play request starting'
    );

    const result = await player.play(context.voiceChannel, query, {
      requestedBy: context.user || undefined,
      searchEngine,
      nodeOptions: {
        metadata: {
          channel: context.textChannel,
          requestedBy: context.user || null
        },
        volume: Number(settings.defaultVolume || process.env.MUSIC_DEFAULT_VOLUME || 65),
        leaveOnEmpty: !stay247,
        leaveOnEmptyCooldown: Number(process.env.MUSIC_EMPTY_LEAVE_MS || 60000),
        leaveOnEnd: false,
        leaveOnStop: false,
        bufferingTimeout: Number(process.env.MUSIC_BUFFERING_TIMEOUT_MS || 90000),
        selfDeaf: true
      }
    });

    const queue = result.queue || getQueue(guildId);
    const playback = await ensurePlayback(queue, result.track || queue?.currentTrack);

    workerLog('playback ensure result', {
      guildId,
      playback,
      isPlaying: queue?.node?.isPlaying?.(),
      isPaused: queue?.node?.isPaused?.(),
      isBuffering: queue?.node?.isBuffering?.(),
      voiceChannelId: context.voiceChannel?.id,
      queueChannelId: queue?.channel?.id || null,
      currentTrack: trackTitle(queue?.currentTrack || result.track)
    });

    logger.info(
      {
        guildId,
        playback,
        isPlaying: queue?.node?.isPlaying?.(),
        isPaused: queue?.node?.isPaused?.(),
        isBuffering: queue?.node?.isBuffering?.(),
        voiceChannelId: context.voiceChannel?.id,
        queueChannelId: queue?.channel?.id || null,
        currentTrack: trackTitle(queue?.currentTrack || result.track)
      },
      'Music playback ensure result'
    );

    logger.info(
      {
        guildId,
        playback,
        isPlaying: queue?.node?.isPlaying?.(),
        isPaused: queue?.node?.isPaused?.(),
        isBuffering: queue?.node?.isBuffering?.(),
        voiceChannelId: context.voiceChannel?.id,
        currentTrack: trackTitle(queue?.currentTrack || result.track)
      },
      'Music playback ensure result'
    );

    const tracks = queueTracks(queue);
    const track = result.track || queue?.currentTrack;
    const isPlaylist = Boolean(result.playlist);
    const playlistSize = result.playlist?.tracks?.length || 0;

    logger.info(
      {
        guildId,
        title: trackTitle(track),
        source: trackSource(track),
        queueSize: tracks.length,
        isPlaylist
      },
      'Music play request queued'
    );

    if (isPlaylist) {
      return ok(
        [
          `playlist added`,
          `**${escapeMarkdown(result.playlist.title || 'Playlist')}**`,
          `${playlistSize} tracks`
        ].join('\n'),
        {
          thumbnail: toThumbnail(result.playlist?.thumbnail || track?.thumbnail),
          footer: toFooter(
            compactFooter(queue, context.user, [
              `${tracks.length} waiting`,
              trackSource(track)
            ]),
            avatarUrl(context.user)
          ),
          v2: musicUi.playlistCard({
            title: result.playlist.title || 'Playlist',
            count: playlistSize,
            thumbnail: result.playlist?.thumbnail || track?.thumbnail,
            url: result.playlist?.url || trackUrl(track),
            footer: compactFooter(queue, context.user, [
              `${tracks.length} waiting`,
              trackSource(track)
            ])
          })
        }
      );
    }

    return ok(
      [
        `added`,
        formatTrack(track)
      ].join('\n'),
      {
        thumbnail: toThumbnail(track?.thumbnail),
        footer: toFooter(
          compactFooter(queue, context.user, [
            trackDuration(track),
            trackSource(track)
          ]),
          avatarUrl(context.user)
        ),
        v2: musicUi.trackCard({
          eyebrow: 'Added to queue',
          emoji: 'play',
          client: clientRef,
          user: userLabel(context.user),
          title: trackTitle(track),
          artist: trackAuthor(track),
          url: trackUrl(track),
          thumbnail: track?.thumbnail,
          metaLine: [trackDuration(track), trackSource(track)].filter(Boolean).join(' · '),
          footer: compactFooter(queue, context.user, [`${tracks.length} waiting`])
        })
      }
    );
  } catch (error) {
    logger.warn({ guildId, query, error }, 'Node music play failed');

    return fail(
      'I could not start playback.',
      error.message || 'The selected source could not be played.',
      'music_play_failed'
    );
  }
}

async function search(guildId, options = {}) {
  await loadExtractors();

  const query = String(options.query || '').trim();

  if (!query) {
    return fail(
      'Tell me what to search for.',
      'Use `musicsearch <song name or URL>`.',
      'music_missing_query'
    );
  }

  if (isYoutubeUrl(query) && envFlag('MUSIC_BLOCK_YOUTUBE', true)) {
    return fail(
      'YouTube search is disabled.',
      'Search by song name or use SoundCloud/Spotify/Apple links.',
      'music_youtube_disabled'
    );
  }

  const context = await resolveContext(guildId, options);
  if (context.error) return context.error;

  const settings = await getMusicSettings(guildId).catch(() => ({ searchEngine: 'soundcloud' }));

  try {
    const result = await player.search(query, {
      requestedBy: context.user || undefined,
      searchEngine: preferredSearchEngine(query, settings)
    });

    const tracks = result?.tracks || [];

    if (!tracks.length) {
      return fail(
        'No music results found.',
        'Try a more specific song, artist, or SoundCloud link.',
        'music_no_results'
      );
    }

    const lines = tracks.slice(0, 8).map((track, index) => {
      const title = truncate(trackTitle(track), 58);
      const author = trackAuthor(track) || 'Unknown artist';
      const duration = trackDuration(track);

      return `\`${index + 1}\` **${escapeMarkdown(title)}** — ${escapeMarkdown(author)} \`${duration}\``;
    });
      
    return panel(['search results', `**${escapeMarkdown(query)}**`].join('\n'), {
      thumbnail: toThumbnail(tracks[0]?.thumbnail),
      fields: [
        {
          name: INVISIBLE,
          value: fitLines(lines),
          inline: false
        }
      ],
      footer: toFooter(`Search ${searchEngineName(settings.searchEngine)} · Use play <song name or URL>`),
      v2: musicUi.searchCard({
        query,
        source: `Search ${searchEngineName(settings.searchEngine)}`,
        tracks: tracks.slice(0, 10).map((track) => ({
          title: trackTitle(track),
          author: trackAuthor(track),
          duration: trackDuration(track),
          url: trackUrl(track),
          source: trackSource(track)
        }))
      })
    });
  } catch (error) {
    logger.warn({ guildId, query, error }, 'Node music search failed');

    return fail(
      'I could not search music right now.',
      error.message || 'The music source did not return results.',
      'music_search_failed'
    );
  }
}

async function queuePayload(guildId) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const tracks = queueTracks(queue);
  const lines = tracks.slice(0, 10).map(queueLine);

  const rawCurrent = queue.currentTrack
    ? {
        title: trackTitle(queue.currentTrack),
        author: trackAuthor(queue.currentTrack),
        duration: trackDuration(queue.currentTrack),
        url: trackUrl(queue.currentTrack),
        thumbnail: queue.currentTrack.thumbnail || null,
        source: trackSource(queue.currentTrack)
      }
    : null;

  const rawTracks = tracks.slice(0, 25).map((track, index) => ({
    index: index + 1,
    title: trackTitle(track),
    author: trackAuthor(track),
    duration: trackDuration(track),
    url: trackUrl(track),
    source: trackSource(track)
  }));

  const data = {
    current: rawCurrent,
    tracks: rawTracks,
    total: tracks.length,
    volume: queue.node?.volume ?? 100,
    loop: repeatModeName(queue.repeatMode),
    state: playbackState(queue),
    filters: activeFilters(queue)
  };

  return panel([
    formatTrack(queue.currentTrack),
    '',
    lines.length ? fitLines(lines) : 'Nothing else queued.'
  ].join('\n'), {
    thumbnail: toThumbnail(queue.currentTrack?.thumbnail),
    footer: toFooter(compactFooter(queue, null, [
      tracks.length > 10 ? `Showing 10/${tracks.length}` : null
    ])),
    queueData: data,
    v2: musicUi.queueCard(data)
  });
}

async function nowPlaying(guildId) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const current = queue.currentTrack;

  return panel([
    `now playing`,
    formatTrack(current),
    progressLine(queue)
  ].join('\n'), {
    thumbnail: toThumbnail(current?.thumbnail),
    footer: toFooter(compactFooter(queue, null, [
      `Filters ${activeFilters(queue)}`,
      trackSource(current)
    ])),
    v2: musicUi.trackCard({
      eyebrow: 'Now playing',
      title: trackTitle(current),
      artist: trackAuthor(current),
      url: trackUrl(current),
      thumbnail: current?.thumbnail,
      metaLine: [
        progressLine(queue).replace(/`/g, ''),
        trackDuration(current),
        trackSource(current)
      ].filter(Boolean).join(' · '),
      footer: compactFooter(queue, null, [`Filters ${activeFilters(queue)}`])
    })
  });
}

async function runQueueAction(guildId, action, onDone) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const result = await action(queue);
  if (result?.ok === false) return result;
  if (result?.error) return result.error;

  return onDone(queue, result);
}

async function runCommand(guildId, command, options = {}) {
  if (!player && clientRef) await initializeMusicPlayer(clientRef);

  if (!player) {
    return fail(
      'Music is not initialized.',
      'The Node music backend has not started yet.',
      'music_not_initialized'
    );
  }

  const normalized = String(command || '').toLowerCase();

  if (normalized === 'play') return play(guildId, options);
  if (normalized === 'search') return search(guildId, options);
  if (normalized === 'status') return getState(guildId);
  if (normalized === 'queue') return queuePayload(guildId);
  if (normalized === 'nowplaying' || normalized === 'np') return nowPlaying(guildId);

  if (normalized === 'pause') {
    return runQueueAction(
      guildId,
      (queue) => queue.node.pause(),
      (queue) => panel(`paused\n${formatTrack(queue.currentTrack, true)}`, {
        footer: toFooter(compactFooter(queue, null)),
        v2: musicUi.actionCard({
          action: 'Paused',
          emoji: 'pause',
          client: clientRef,
          track: trackData(queue.currentTrack),
          footer: compactFooter(queue, null)
        })
      })
    );
  }

  if (normalized === 'resume') {
    return runQueueAction(
      guildId,
      (queue) => queue.node.resume(),
      (queue) => ok(`resumed\n${formatTrack(queue.currentTrack, true)}`, {
        footer: toFooter(compactFooter(queue, null)),
        v2: musicUi.actionCard({
          action: 'Resumed',
          emoji: 'play',
          client: clientRef,
          track: trackData(queue.currentTrack),
          footer: compactFooter(queue, null)
        })
      })
    );
  }

  if (normalized === 'skip') {
    return runQueueAction(
      guildId,
      (queue) => queue.node.skip(),
      (queue) => {
        const current = queue.currentTrack;

        return ok(
          current
            ? [`skipped`, formatTrack(current)].join('\n')
            : 'Skipped the current track.',
          {
            thumbnail: toThumbnail(current?.thumbnail),
            footer: toFooter(compactFooter(queue, null)),
            v2: musicUi.actionCard({
              action: 'Skipped',
              emoji: 'forward',
            client: clientRef,
              track: trackData(current),
              footer: compactFooter(queue, null)
            })
          }
        );
      }
    );
  }

  if (normalized === 'stop' || normalized === 'leave') {
    return runQueueAction(
      guildId,
      (queue) => {
        queue.delete();
        return true;
      },
      () => {
        const action = normalized === 'leave' ? 'Disconnected' : 'Stopped';
        const detail = normalized === 'leave'
          ? 'Left voice and cleared the queue.'
          : 'Playback stopped and the queue was cleared.';

        return panel(detail, {
          v2: musicUi.musicNotice({
            label: 'Music',
            //title: action,
            detail
          })
        });
      }
    );
  }

  if (normalized === 'clear') {
    return runQueueAction(
      guildId,
      (queue) => {
        queue.clear();
        return true;
      },
      () => panel('Queue cleared. Removed every waiting track.', {
        v2: musicUi.musicNotice({
          label: 'Queue',
          detail: 'Removed every waiting track.'
        })
      })
    );
  }

  if (normalized === 'shuffle') {
    return runQueueAction(
      guildId,
      (queue) => queue.toggleShuffle(false),
      (queue) => panel(`Shuffle is now ${queue.isShuffling ? 'on' : 'off'}.`, {
        footer: toFooter(compactFooter(queue, null)),
        v2: musicUi.musicNotice({
          label: 'Queue',
          detail: `Shuffle is now **${queue.isShuffling ? 'on' : 'off'}**.`,
          status: compactFooter(queue, null)
        })
      })
    );
  }

  if (normalized === 'volume' || normalized === 'settings.volume') {
    const value = Math.max(0, Math.min(150, Number.parseInt(String(options.value || ''), 10)));

    if (!Number.isFinite(value)) {
      return fail(
        'Invalid volume.',
        'Use a number from 0 to 150.',
        'music_invalid_volume'
      );
    }

    if (normalized === 'settings.volume') {
      await saveMusicSettings(guildId, { defaultVolume: value }).catch(() => null);
    }

    const existing = requireQueue(guildId);

    if (!existing.queue) {
      return panel(`${ICONS.volume} \`volume\`\nDefault volume set to **${value}%**.`);
    }

    return runQueueAction(
      guildId,
      (queue) => queue.node.setVolume(value),
      (queue) => panel(`Volume set to ${value}%.`, {
        footer: toFooter(compactFooter(queue, null)),
        v2: musicUi.musicNotice({
          label: 'Music',
          detail: `Volume set to **${value}%**.`,
          status: compactFooter(queue, null)
        })
      })
    );
  }

  if (normalized === 'seek') {
    const ms = parseDuration(options.position);

    if (!ms && ms !== 0) {
      return fail(
        'Invalid seek position.',
        'Use `1:30`, `90`, or `2m30s`.',
        'music_invalid_seek'
      );
    }

    return runQueueAction(
      guildId,
      (queue) => queue.node.seek(ms),
      (queue) => panel(`${ICONS.arrow} \`seek\`\nJumped to **${msToDuration(ms)}**.`, {
        footer: toFooter(compactFooter(queue, null))
      })
    );
  }

  if (normalized === 'remove') {
    const index = oneBasedIndex(options.index);

    if (index === null) {
      return fail(
        'Invalid queue number.',
        'Use the number shown in `queue`.',
        'music_invalid_index'
      );
    }

    return runQueueAction(
      guildId,
      (queue) => {
        const removed = queue.node.remove(index);

        return removed
          ? { removed }
          : fail(
              'I could not remove that track.',
              'That queue number does not exist.',
              'music_invalid_index'
            );
      },
      (queue, result) => panel(`${ICONS.x} \`removed\`\n**${escapeMarkdown(result.removed.title || 'Track')}**`, {
        footer: toFooter(compactFooter(queue, null))
      })
    );
  }

  if (normalized === 'move') {
    const from = oneBasedIndex(options.from);
    const to = oneBasedIndex(options.to);

    if (from === null || to === null) {
      return fail(
        'Invalid queue numbers.',
        'Use numbers shown in `queue`.',
        'music_invalid_index'
      );
    }

    return runQueueAction(
      guildId,
      (queue) => {
        queue.node.move(from, to);
        return true;
      },
      (queue) => panel(`${ICONS.arrow} \`moved\`\nTrack **${from + 1}** moved to **${to + 1}**.`, {
        footer: toFooter(compactFooter(queue, null))
      })
    );
  }

  if (normalized === 'skipto') {
    const index = oneBasedIndex(options.index);

    if (index === null) {
      return fail(
        'Invalid queue number.',
        'Use the number shown in `queue`.',
        'music_invalid_index'
      );
    }

    return runQueueAction(
      guildId,
      (queue) => queue.node.skipTo(index),
      (queue) => ok(`${ICONS.skip} \`skip to\`\nSkipped to track **${index + 1}**.`, {
        footer: toFooter(compactFooter(queue, null))
      })
    );
  }

  if (normalized.startsWith('loop.')) {
    const mode = normalized.split('.')[1];

    const repeat = mode === 'track'
      ? QueueRepeatMode.TRACK
      : mode === 'queue'
        ? QueueRepeatMode.QUEUE
        : QueueRepeatMode.OFF;

    return runQueueAction(
      guildId,
      (queue) => {
        queue.setRepeatMode(repeat);
        return true;
      },
      (queue) => panel(`Loop mode set to ${repeatModeName(repeat)}.`, {
        footer: toFooter(compactFooter(queue, null)),
        v2: musicUi.musicNotice({
          label: 'Music',
          detail: `Mode set to **${repeatModeName(repeat)}**.`,
          status: compactFooter(queue, null)
        })
      })
    );
  }

  if (normalized === 'autoplay' || normalized === 'settings.autoplay') {
    const enabled = String(options.enabled || '').toLowerCase() !== 'off';

    return runQueueAction(
      guildId,
      (queue) => {
        queue.setRepeatMode(enabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
        return true;
      },
      (queue) => panel(`Autoplay is now ${enabled ? 'on' : 'off'}.`, {
        footer: toFooter(compactFooter(queue, null)),
        v2: musicUi.musicNotice({
          label: 'Music',
          detail: `Autoplay is now **${enabled ? 'on' : 'off'}**.`,
          status: compactFooter(queue, null)
        })
      })
    );
  }

  if (normalized === 'stats') {
    const stats = player.generateStatistics?.();

    return panel(`${ICONS.queue} \`backend\`\nNode music backend is running.`, {
      footer: toFooter([
        `${player.extractors?.size || 0} sources`,
        `Search ${process.env.MUSIC_SEARCH_ENGINE || 'soundcloud'}`,
        ffmpegPath ? 'FFmpeg ready' : 'FFmpeg unknown',
        stats?.eventLoopLag ? `${Math.round(stats.eventLoopLag)}ms lag` : null
      ].filter(Boolean).join(' · '))
    });
  }

  if (normalized === 'history') {
    return runQueueAction(
      guildId,
      (queue) => {
        const previous = queue.history?.tracks?.toArray?.() || [];
        return { previous };
      },
      (queue, result) => {
        const lines = result.previous
          .slice(-10)
          .reverse()
          .map((track, index) => `\`${index + 1}\` ${escapeMarkdown(trackTitle(track))}`);

        return panel(`${ICONS.queue} \`history\`\n${lines.length ? fitLines(lines) : 'No recent tracks.'}`, {
          footer: toFooter(compactFooter(queue, null))
        });
      }
    );
  }

  if (normalized === 'lyrics') {
    return panel(`${ICONS.search} \`lyrics\`\nLyrics lookup is not enabled in this backend.`);
  }

  if (normalized.startsWith('filter.')) {
    const mode = normalized.split('.').slice(1).join('.') || options.mode || 'off';

    return runQueueAction(
      guildId,
      (queue) => setAudioFilter(queue, mode),
      (queue, result) => {
        if (result?.filter === 'off') {
          return panel(`${ICONS.filter} \`filter\`\nAudio filters are now **off**.`, {
            footer: toFooter(compactFooter(queue, null))
          });
        }

        return panel(`${ICONS.filter} \`filter\`\nApplied **${escapeMarkdown(result.filter)}**.`, {
          footer: toFooter(compactFooter(queue, null, [`Filters ${activeFilters(queue)}`]))
        });
      }
    );
  }

  if (normalized === 'settings.search') {
    const engine = String(options.engine || options.value || '').toLowerCase();

    if (!['soundcloud', 'spotify', 'apple', 'applemusic', 'auto'].includes(engine)) {
      return fail(
        'Invalid search engine.',
        'Use soundcloud, spotify, apple, or auto.',
        'music_invalid_search_engine'
      );
    }

    const saved = await saveMusicSettings(guildId, { searchEngine: engine });
    return panel(`${ICONS.settings} \`settings\`\nSearch engine set to **${searchEngineName(saved.searchEngine)}**.`);
  }

  if (normalized === 'settings.announce') {
    return panel(`${ICONS.settings} \`settings\`\nTrack announcements are controlled with \`MUSIC_ANNOUNCE_TRACKS=true\` in your env.`);
  }

  if (normalized === 'settings' || normalized.startsWith('settings.')) {
    const settings = await getMusicSettings(guildId).catch(() => null);

    return panel([
      `${ICONS.settings} \`settings\``,
      `24/7: **${settings?.stay247 ? 'on' : 'off'}**`,
      `Default volume: **${settings?.defaultVolume || Number(process.env.MUSIC_DEFAULT_VOLUME || 65)}%**`,
      `Search: **${searchEngineName(settings?.searchEngine)}**`
    ].join('\n'));
  }

  if (['panel', 'export', 'import', 'node.failover'].includes(normalized)) {
    return panel(`${ICONS.settings} \`music\`\nThis sidecar-era utility is not needed with the Node backend.`);
  }

  return fail(
    'Unknown music command.',
    `The Node backend does not recognize \`${command}\`.`,
    'music_unknown_command'
  );
}

module.exports = {
  getState,
  health,
  initializeMusicPlayer,
  isNodeMusicEnabled,
  runCommand
};