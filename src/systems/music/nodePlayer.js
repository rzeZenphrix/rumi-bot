const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  MessageFlags
} = require('discord.js');
const { Player, QueueRepeatMode, QueryType } = require('discord-player');
const {
  AppleMusicExtractor,
  DefaultExtractors,
  SoundCloudExtractor,
  SpotifyExtractor
} = require('@discord-player/extractor');
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';
const { YoutubeExtractor } = require('discord-player-youtube');

const logger = require('../logging/logger');
const db = require('../../services/database');
const respond = require('../../utils/respond');

const MUSIC_COLOR = Number.parseInt(process.env.MUSIC_EMBED_COLOR || 'c8d8f2', 16);
const MUSIC_PANEL_COLOR = Number.parseInt(process.env.MUSIC_PANEL_COLOR || 'c8d8f2', 16);
const MUSIC_OK_COLOR = Number.parseInt(process.env.MUSIC_OK_COLOR || 'c8d8f2', 16);
const ERROR_COLOR = Number.parseInt(process.env.MUSIC_ERROR_COLOR || 'ed4245', 16);
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

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function isNodeMusicEnabled() {
  const backend = String(process.env.MUSIC_BACKEND || '').trim().toLowerCase();
  if (backend) return backend === 'node';
  return envFlag('NODE_MUSIC_ENABLED', true);
}

async function getMusicSettings(guildId) {
  return db.getKv(`music:settings:${guildId}`, 'config', {
    stay247: false,
    defaultVolume: Number(process.env.MUSIC_DEFAULT_VOLUME || 75)
  });
}

async function saveMusicSettings(guildId, patch = {}) {
  const current = await getMusicSettings(guildId).catch(() => ({
    stay247: false,
    defaultVolume: Number(process.env.MUSIC_DEFAULT_VOLUME || 75)
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

function prunePayload(payload) {
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined || payload[key] === null) delete payload[key];
    if (Array.isArray(payload[key]) && payload[key].length === 0) delete payload[key];
  }

  delete payload.title;
  return payload;
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

function musicControls(queue) {
  if (!queue || queue.deleted) return [];

  const paused = Boolean(queue.node?.isPaused?.());
  const pause = new ButtonBuilder()
    .setCustomId(`music:${paused ? 'resume' : 'pause'}`)
    .setLabel(paused ? 'Resume' : 'Pause')
    .setStyle(ButtonStyle.Secondary);

  const skip = new ButtonBuilder()
    .setCustomId('music:skip')
    .setLabel('Skip')
    .setStyle(ButtonStyle.Primary);

  const queueButton = new ButtonBuilder()
    .setCustomId('music:queue')
    .setLabel('Queue')
    .setStyle(ButtonStyle.Secondary);

  const stop = new ButtonBuilder()
    .setCustomId('music:stop')
    .setLabel('Stop')
    .setStyle(ButtonStyle.Danger);

  return [new ActionRowBuilder().addComponents(pause, skip, queueButton, stop)];
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

function premiumEmbed(description, extra = {}) {
  return prunePayload({
    color: MUSIC_COLOR,
    description: truncate(description || '', 4096),
    ...extra
  });
}

function success(_title, description, extra = {}) {
  return {
    ok: true,
    ...premiumEmbed(description, {
      color: extra.color || MUSIC_OK_COLOR,
      ...extra
    })
  };
}

function failure(error, detail, code = 'music_node_error') {
  return {
    ok: false,
    code,
    error,
    detail,
    ...premiumEmbed(`**${escapeMarkdown(error)}**\n${escapeMarkdown(detail)}`, {
      color: ERROR_COLOR
    })
  };
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

function normalizeFilterName(mode) {
  const raw = String(mode || '').trim();
  if (!raw) return '';
  return FILTER_ALIASES.get(raw) || FILTER_ALIASES.get(raw.toLowerCase()) || raw;
}

function activeFilters(queue) {
  const current = queue?.filters?.ffmpeg?.filters || [];
  return current.length ? current.map((filter) => `\`${filter}\``).join(', ') : '`off`';
}

async function setAudioFilter(queue, mode) {
  const ffmpeg = queue?.filters?.ffmpeg;
  if (!ffmpeg?.setFilters) {
    return {
      error: failure(
        'Audio filters are unavailable.',
        'Install/configure FFmpeg and make sure this discord-player version supports ffmpeg filters.',
        'music_filters_unavailable'
      )
    };
  }

  const filter = normalizeFilterName(mode);

  if (!filter || filter === 'off') {
    await ffmpeg.setFilters([]);
    return { filter: 'off', active: [] };
  }

  if (ffmpeg.isValidFilter && !ffmpeg.isValidFilter(filter)) {
    return {
      error: failure(
        'Unknown audio filter.',
        'Try bassboost, nightcore, vaporwave, lofi, 8d, karaoke, tremolo, vibrato, phaser, subboost, treble, normalizer, surrounding, pulsator, mono, reverse, flanger, chorus, compressor, or off.',
        'music_unknown_filter'
      )
    };
  }

  await ffmpeg.setFilters([filter]);

  return {
    filter,
    active: ffmpeg.filters || []
  };
}

async function lyricsFor(track) {
  const title = trackTitle(track);
  const author = trackAuthor(track) || '';

  if (!track || !title || title === 'Unknown track') {
    return failure('No track found.', 'Play a song first, then use `lyrics`.', 'music_no_track');
  }

  const attempts = [
    [author, title],
    [title, author]
  ].filter(([a, b]) => a && b);

  for (const [artist, song] of attempts) {
    const url = `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`;
    const response = await fetch(url).catch(() => null);
    if (!response?.ok) continue;

    const data = await response.json().catch(() => null);
    const lyrics = String(data?.lyrics || '').trim();

    if (lyrics) {
      return success('', `\`lyrics\`\n**${escapeMarkdown(title)}**\n\n${truncate(lyrics, 3800)}`, {
        color: MUSIC_PANEL_COLOR
      });
    }
  }

  return failure('Lyrics not found.', 'Try a clearer song title or artist name.', 'music_lyrics_not_found');
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

function queueSummary(queue) {
  const waiting = queueTracks(queue).length;
  const volume = queue?.node?.volume ?? 100;
  const loop = repeatModeName(queue?.repeatMode);

  return `${playbackState(queue)} · ${waiting} waiting · ${volume}% · Loop ${loop}`;
}

function fitLines(lines, max = 1000) {
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

function queueLine(track, index) {
  const title = truncate(trackTitle(track), 55);
  const duration = trackDuration(track);
  const url = trackUrl(track);

  const label = url
    ? `[${escapeLinkLabel(title)}](${url})`
    : escapeMarkdown(title);

  return `\`${String(index + 1).padStart(2, '0')}\` ${label} \`${duration}\``;
}

function envValue(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return null;
}

function extractorOptions() {
  return {
    [SpotifyExtractor.identifier]: {
      clientId: envValue('DP_SPOTIFY_CLIENT_ID', 'SPOTIFY_CLIENT_ID'),
      clientSecret: envValue('DP_SPOTIFY_CLIENT_SECRET', 'SPOTIFY_CLIENT_SECRET')
    },
    [SoundCloudExtractor.identifier]: {
      clientId: envValue('SOUNDCLOUD_CLIENT_ID', 'SOUNDCLOUD_CLIENTID'),
      oauthToken: envValue('SOUNDCLOUD_OAUTH_TOKEN', 'SOUNDCLOUD_TOKEN')
    },
    [AppleMusicExtractor.identifier]: {}
  };
}

function youtubeOptions() {
  return {
    cookie: envValue('YOUTUBE_COOKIE', 'YOUTUBE_COOKIES'),
    filterAutoplayTracks: true,
    disableYTJSLog: true,
    sabrPlaybackOptions: {
      audioQuality: 'high',
      preferOpus: true,
      maxRetries: 12,
      stallDetectionMs: 45000
    }
  };
}

function preferredSearchEngine(query) {
  const value = String(query || '').trim();
  if (/^https?:\/\//i.test(value)) return QueryType.AUTO;

  const preferred = String(process.env.MUSIC_SEARCH_ENGINE || 'spotify').trim().toLowerCase();
  if (preferred === 'youtube') return QueryType.YOUTUBE_SEARCH;
  if (preferred === 'soundcloud') return QueryType.SOUNDCLOUD_SEARCH;
  if (preferred === 'auto') return QueryType.AUTO_SEARCH;
  return QueryType.SPOTIFY_SEARCH;
}

async function ensurePlayback(queue) {
  if (!queue || queue.deleted) return false;

  if (queue.node?.isPaused?.()) {
    queue.node.resume();
  }

  if (queue.node?.isPlaying?.() || queue.node?.isBuffering?.()) {
    return true;
  }

  try {
    await queue.node.play(null);
    return true;
  } catch (error) {
    logger.warn({ guildId: queue.guild?.id, error }, 'Music queue failed to start immediate playback');
    return false;
  }
}

function requireQueue(guildId) {
  const queue = getQueue(guildId);

  if (!queue || queue.deleted) {
    return {
      error: failure(
        'Nothing is playing.',
        'Start something with `play <song or URL>` first.',
        'music_no_queue'
      )
    };
  }

  return { queue };
}

async function resolveContext(guildId, options = {}) {
  if (!clientRef) {
    return {
      error: failure(
        'Music is still starting.',
        'Try again in a few seconds.',
        'music_not_initialized'
      )
    };
  }

  const guild = clientRef.guilds.cache.get(guildId) || await clientRef.guilds.fetch(guildId).catch(() => null);

  if (!guild) {
    return {
      error: failure(
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
    return failure(
      'Join a voice channel first.',
      'I need to know where to play music.',
      'music_no_voice_channel'
    );
  }

  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(voiceChannel.type)) {
    return failure(
      'That is not a playable voice channel.',
      'Join a voice or stage channel first.',
      'music_invalid_voice_channel'
    );
  }

  const me = voiceChannel.guild.members.me;
  const permissions = me ? voiceChannel.permissionsFor(me) : null;

  if (permissions && (!permissions.has('Connect') || !permissions.has('Speak'))) {
    return failure(
      'I cannot play in that voice channel.',
      'I need Connect and Speak permissions.',
      'music_missing_voice_permissions'
    );
  }

  return null;
}

async function loadExtractors() {
  if (!player) return;
  if (extractorLoadPromise) return extractorLoadPromise;

  extractorLoadPromise = (async () => {
    await player.extractors.loadMulti(DefaultExtractors, extractorOptions()).catch((error) => {
      logger.warn({ error }, 'Default music extractors failed to load');
    });

    if (!player.extractors.isRegistered(YoutubeExtractor.identifier)) {
      await player.extractors.register(YoutubeExtractor, youtubeOptions()).catch((error) => {
        logger.warn({ error }, 'YouTube music extractor failed to load');
      });
    }
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

  player = new Player(client, {
    skipFFmpeg: false,
    ytdlOptions: {
      quality: 'highestaudio',
      filter: 'audioonly',
      dlChunkSize: 0,
      highWaterMark: 1 << 25
    }
  });

  client.rumiMusicPlayer = player;

  player.events.on('playerStart', (queue, track) => {
    const channel = queue.metadata?.channel;

    if (!channel?.send || !envFlag('MUSIC_ANNOUNCE_TRACKS', false)) return;

    const requestedBy = track?.requestedBy || queue.metadata?.requestedBy || null;

    channel.send({
      embeds: [
        premiumEmbed(
          [
            '`now playing`',
            formatTrack(track),
            queueSummary(queue)
          ].join('\n'),
          {
            color: MUSIC_PANEL_COLOR,
            thumbnail: toThumbnail(track?.thumbnail),
            fields: [
              {
                name: 'Progress',
                value: progressLine(queue),
                inline: false
              }
            ],
            footer: toFooter(
              requestedBy ? `Requested by ${userLabel(requestedBy)}` : 'Rumi music',
              avatarUrl(requestedBy)
            )
          }
        )
      ]
    }).catch(() => {});
  });

  player.events.on('error', (queue, error) => {
    logger.warn({ guildId: queue?.guild?.id, error }, 'Music queue error');
  });

  player.events.on('playerError', (queue, error) => {
    logger.warn({ guildId: queue?.guild?.id, error }, 'Music player error');
  });

  await loadExtractors();

  logger.info({ extractors: player.extractors.size }, 'Node music backend is ready');
  return player;
}

async function health() {
  return {
    ok: Boolean(player),
    backend: 'node',
    ready: Boolean(player),
    extractors: player?.extractors?.size || 0
  };
}

async function getState(guildId) {
  const queue = getQueue(guildId);

  if (!queue) {
    return success('', '`idle`\nNothing is currently playing in this server.', {
      color: MUSIC_PANEL_COLOR,
      footer: toFooter(`${player?.extractors?.size || 0} sources ready`)
    });
  }

  const tracks = queueTracks(queue);

  return success('', [
    `\`${playbackState(queue).toLowerCase()}\``,
    formatTrack(queue.currentTrack),
    progressLine(queue),
    `Up next: **${tracks.length}**`
  ].join('\n'), {
    color: MUSIC_PANEL_COLOR,
    thumbnail: toThumbnail(queue.currentTrack?.thumbnail),
    components: musicControls(queue),
    footer: toFooter(`${queue.node?.volume ?? 100}% volume - Loop ${repeatModeName(queue.repeatMode)}`)
  });
}

async function play(guildId, options = {}) {
  await loadExtractors();

  const query = String(options.query || '').trim();

  if (!query) {
    return failure(
      'Tell me what to play.',
      'Use `play <song name or URL>`.',
      'music_missing_query'
    );
  }

  const context = await resolveContext(guildId, options);
  if (context.error) return context.error;

  const voiceError = voiceChannelError(context.voiceChannel);
  if (voiceError) return voiceError;

  try {
    const settings = await getMusicSettings(guildId).catch(() => ({
      stay247: false,
      defaultVolume: Number(process.env.MUSIC_DEFAULT_VOLUME || 75)
    }));

    const stay247 = Boolean(settings.stay247);
    const existingQueue = getQueue(guildId);
    const wasIdle = !existingQueue?.currentTrack && queueTracks(existingQueue).length === 0;

    const playOptions = {
      requestedBy: context.user || undefined,
      searchEngine: preferredSearchEngine(query),
      fallbackSearchEngine: QueryType.AUTO_SEARCH,
      nodeOptions: {
        metadata: {
          channel: context.textChannel,
          requestedBy: context.user || null
        },
        volume: Number(settings.defaultVolume || process.env.MUSIC_DEFAULT_VOLUME || 75),
        leaveOnEmpty: !stay247,
        leaveOnEmptyCooldown: Number(process.env.MUSIC_EMPTY_LEAVE_MS || 60000),
        leaveOnEnd: false,
        leaveOnStop: false,
        selfDeaf: true
      }
    };

    let result;
    try {
      result = await player.play(context.voiceChannel, query, playOptions);
    } catch (error) {
      if (playOptions.searchEngine === QueryType.AUTO_SEARCH || /^https?:\/\//i.test(query)) throw error;
      result = await player.play(context.voiceChannel, query, {
        ...playOptions,
        searchEngine: QueryType.AUTO_SEARCH
      });
    }

    const queue = result.queue || getQueue(guildId);
    const playbackStarted = await ensurePlayback(queue);
    const tracks = queueTracks(queue);

    const track = result.track || queue?.currentTrack;
    const isPlaylist = Boolean(result.playlist);
    const playlistSize = result.playlist?.tracks?.length || 0;

    if (isPlaylist) {
      return success(
        '',
        [
          wasIdle ? '`started playing`' : '`playlist added`',
          `**${escapeMarkdown(result.playlist.title || 'Playlist')}**`,
          `${playlistSize} tracks - ${tracks.length} waiting`
        ].join('\n'),
        {
          color: MUSIC_PANEL_COLOR,
          thumbnail: toThumbnail(result.playlist?.thumbnail || track?.thumbnail),
          components: musicControls(queue),
          footer: toFooter(
            `${playbackStarted ? 'Playing now' : 'Queued'} - ${stay247 ? '24/7 on' : `${queue?.node?.volume ?? Number(settings.defaultVolume || 75)}% volume`}`,
            avatarUrl(context.user)
          )
        }
      );
    }

    return success(
      '',
      [
        wasIdle ? '`started playing`' : '`added to queue`',
        formatTrack(track),
        trackDuration(track)
      ].join('\n'),
      {
        color: MUSIC_PANEL_COLOR,
        thumbnail: toThumbnail(track?.thumbnail),
        components: musicControls(queue),
        footer: toFooter(
          `${playbackStarted ? 'Playing now' : 'Queued'} - ${tracks.length} waiting - ${queue?.node?.volume ?? Number(settings.defaultVolume || 75)}% volume`,
          avatarUrl(context.user)
        )
      }
    );
  } catch (error) {
    logger.warn({ guildId, query, error }, 'Node music play failed');

    return failure(
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
    return failure(
      'Tell me what to search for.',
      'Use `musicsearch <song name or URL>`.',
      'music_missing_query'
    );
  }

  const context = await resolveContext(guildId, options);
  if (context.error) return context.error;

  try {
    let result = await player.search(query, {
      requestedBy: context.user || undefined,
      searchEngine: preferredSearchEngine(query),
      fallbackSearchEngine: QueryType.AUTO_SEARCH
    }).catch(async (error) => {
      if (/^https?:\/\//i.test(query)) throw error;
      return player.search(query, {
        requestedBy: context.user || undefined,
        searchEngine: QueryType.AUTO_SEARCH
      });
    });

    const tracks = result?.tracks || [];

    if (!tracks.length) {
      return failure(
        'No music results found.',
        'Try a more specific song, artist, or URL.',
        'music_no_results'
      );
    }

    const lines = tracks.slice(0, 8).map((track, index) => {
      const title = truncate(trackTitle(track), 54);
      const author = trackAuthor(track) || 'Unknown artist';
      const duration = trackDuration(track);

      return `\`${index + 1}\` **${escapeMarkdown(title)}** — ${escapeMarkdown(author)} \`${duration}\``;
    });

    return success('', ['`search results`', `**${escapeMarkdown(query)}**`, '', fitLines(lines, 1400)].join('\n'), {
      color: MUSIC_PANEL_COLOR,
      thumbnail: toThumbnail(tracks[0]?.thumbnail),
      footer: toFooter('Use play <song name or URL> to queue a result.')
    });
  } catch (error) {
    logger.warn({ guildId, query, error }, 'Node music search failed');

    return failure(
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

  return success('', ['`queue`', formatTrack(queue.currentTrack), queueSummary(queue)].join('\n'), {
    color: MUSIC_PANEL_COLOR,
    thumbnail: toThumbnail(queue.currentTrack?.thumbnail),
    fields: [
      {
        name: 'Progress',
        value: progressLine(queue),
        inline: false
      },
      {
        name: `Up next · ${tracks.length}`,
        value: lines.length ? fitLines(lines) : 'Nothing else queued.',
        inline: false
      }
    ],
    footer: tracks.length > 10
      ? toFooter(`Showing 10 of ${tracks.length} queued tracks`)
      : undefined
  });
}

async function nowPlaying(guildId) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const tracks = queueTracks(queue);

  return success('', ['`now playing`', formatTrack(queue.currentTrack)].join('\n'), {
    color: MUSIC_PANEL_COLOR,
    thumbnail: toThumbnail(queue.currentTrack?.thumbnail),
    fields: [
      { name: 'Progress', value: progressLine(queue), inline: false },
      { name: 'Volume', value: `${queue.node?.volume ?? 100}%`, inline: true },
      { name: 'Queue', value: `${tracks.length} waiting`, inline: true },
      { name: 'Loop', value: repeatModeName(queue.repeatMode), inline: true },
      { name: 'Filters', value: activeFilters(queue), inline: true }
    ]
  });
}

async function minimalQueuePayload(guildId) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const tracks = queueTracks(queue);
  const lines = tracks.slice(0, 10).map(queueLine);

  return success('', [
    '`queue`',
    formatTrack(queue.currentTrack),
    progressLine(queue),
    '',
    lines.length ? fitLines(lines, 1500) : 'Nothing else queued.'
  ].join('\n'), {
    color: MUSIC_PANEL_COLOR,
    thumbnail: toThumbnail(queue.currentTrack?.thumbnail),
    components: musicControls(queue),
    footer: tracks.length > 10
      ? toFooter(`Showing 10 of ${tracks.length} queued tracks`)
      : undefined
  });
}

async function minimalNowPlaying(guildId) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const tracks = queueTracks(queue);

  return success('', ['`now playing`', formatTrack(queue.currentTrack), progressLine(queue)].join('\n'), {
    color: MUSIC_PANEL_COLOR,
    thumbnail: toThumbnail(queue.currentTrack?.thumbnail),
    components: musicControls(queue),
    footer: toFooter(`${tracks.length} waiting - ${queue.node?.volume ?? 100}% volume - Loop ${repeatModeName(queue.repeatMode)}`)
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
    return failure(
      'Music is not initialized.',
      'The Node music backend has not started yet.',
      'music_not_initialized'
    );
  }

  const normalized = String(command || '').toLowerCase();

  if (normalized === 'play') return play(guildId, options);
  if (normalized === 'search') return search(guildId, options);
  if (normalized === 'status') return getState(guildId);
  if (normalized === 'queue') return minimalQueuePayload(guildId);
  if (normalized === 'nowplaying' || normalized === 'np') return minimalNowPlaying(guildId);

  if (normalized === 'pause') {
    return runQueueAction(
      guildId,
      (queue) => queue.node.pause(),
      () => success('', '`paused`\nPlayback is paused.')
    );
  }

  if (normalized === 'resume') {
    return runQueueAction(
      guildId,
      (queue) => queue.node.resume(),
      () => success('', '`resumed`\nPlayback is live again.')
    );
  }

  if (normalized === 'skip') {
    return runQueueAction(
      guildId,
      (queue) => queue.node.skip(),
      (queue) => success(
        '',
        queue.currentTrack
          ? ['`skipped`', formatTrack(queue.currentTrack)].join('\n')
          : '`skipped`\nSkipped the current track.',
        {
          thumbnail: toThumbnail(queue.currentTrack?.thumbnail)
        }
      )
    );
  }

  if (normalized === 'stop' || normalized === 'leave') {
    return runQueueAction(
      guildId,
      (queue) => {
        queue.delete();
        return true;
      },
      () => success(
        '',
        normalized === 'leave'
          ? '`disconnected`\nLeft the voice channel and cleared the queue.'
          : '`stopped`\nPlayback stopped and the queue was cleared.'
      )
    );
  }

  if (normalized === 'clear') {
    return runQueueAction(
      guildId,
      (queue) => {
        queue.clear();
        return true;
      },
      () => success('', '`queue cleared`\nRemoved every waiting track.')
    );
  }

  if (normalized === 'shuffle') {
    return runQueueAction(
      guildId,
      (queue) => queue.toggleShuffle(false),
      (queue) => success('', `\`shuffle\`\nShuffle is now **${queue.isShuffling ? 'on' : 'off'}**.`)
    );
  }

  if (normalized === 'volume' || normalized === 'settings.volume') {
    const value = Math.max(0, Math.min(150, Number.parseInt(String(options.value || ''), 10)));

    if (!Number.isFinite(value)) {
      return failure(
        'Invalid volume.',
        'Use a number from 0 to 150.',
        'music_invalid_volume'
      );
    }

    if (normalized === 'settings.volume') {
      await saveMusicSettings(guildId, { defaultVolume: value }).catch(() => null);
    }

    const { queue } = requireQueue(guildId);
    if (!queue) {
      return success('', `\`volume\`\nDefault volume set to **${value}%**.`, {
        color: MUSIC_PANEL_COLOR
      });
    }

    return runQueueAction(
      guildId,
      (activeQueue) => activeQueue.node.setVolume(value),
      () => success('', `\`volume\`\nSet to **${value}%**.`)
    );
  }

  if (normalized === 'seek') {
    const ms = parseDuration(options.position);

    if (!ms && ms !== 0) {
      return failure(
        'Invalid seek position.',
        'Use `1:30`, `90`, or `2m30s`.',
        'music_invalid_seek'
      );
    }

    return runQueueAction(
      guildId,
      (queue) => queue.node.seek(ms),
      () => success('', `\`seek\`\nJumped to **${msToDuration(ms)}**.`)
    );
  }

  if (normalized === 'remove') {
    const index = oneBasedIndex(options.index);

    if (index === null) {
      return failure(
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
          : failure(
              'I could not remove that track.',
              'That queue number does not exist.',
              'music_invalid_index'
            );
      },
      (_, result) => success('', `\`removed\`\n**${escapeMarkdown(result.removed.title || 'Track')}** was removed from the queue.`)
    );
  }

  if (normalized === 'move') {
    const from = oneBasedIndex(options.from);
    const to = oneBasedIndex(options.to);

    if (from === null || to === null) {
      return failure(
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
      () => success('', `\`moved\`\nTrack **${from + 1}** moved to position **${to + 1}**.`)
    );
  }

  if (normalized === 'skipto') {
    const index = oneBasedIndex(options.index);

    if (index === null) {
      return failure(
        'Invalid queue number.',
        'Use the number shown in `queue`.',
        'music_invalid_index'
      );
    }

    return runQueueAction(
      guildId,
      (queue) => queue.node.skipTo(index),
      () => success('', `\`skip to\`\nSkipped to track **${index + 1}**.`)
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
      () => success('', `\`loop\`\nMode set to **${repeatModeName(repeat)}**.`)
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
      () => success('', `\`autoplay\`\nAutoplay is now **${enabled ? 'on' : 'off'}**.`)
    );
  }

  if (normalized === 'stats') {
    const stats = player.generateStatistics?.();

    return success('', '`backend`\nNode music backend is running.', {
      color: MUSIC_PANEL_COLOR,
      fields: [
        { name: 'Queues', value: String(player.nodes?.cache?.size || player.queues?.cache?.size || 0), inline: true },
        { name: 'Sources', value: String(player.extractors?.size || 0), inline: true },
        { name: 'Engine', value: 'discord-player', inline: true },
        ...(stats?.eventLoopLag
          ? [{ name: 'Event loop', value: `${Math.round(stats.eventLoopLag)}ms`, inline: true }]
          : [])
      ]
    });
  }

  if (normalized === 'history') {
    return runQueueAction(
      guildId,
      (queue) => {
        const previous = queue.history?.tracks?.toArray?.() || [];
        return { previous };
      },
      (_, result) => {
        const lines = result.previous
          .slice(-10)
          .reverse()
          .map((track, index) => `\`${index + 1}\` ${escapeMarkdown(trackTitle(track))}`);

        return success('', '`history`\nRecently played tracks.', {
          color: MUSIC_PANEL_COLOR,
          fields: [
            {
              name: INVISIBLE,
              value: lines.length ? fitLines(lines) : 'No recent tracks in this queue.',
              inline: false
            }
          ]
        });
      }
    );
  }

  if (normalized === 'lyrics') {
    return runQueueAction(
      guildId,
      (queue) => lyricsFor(queue.currentTrack),
      (_, result) => result
    );
  }

  if (normalized.startsWith('filter.')) {
    const mode = normalized.split('.').slice(1).join('.') || options.mode || 'off';

    return runQueueAction(
      guildId,
      (queue) => setAudioFilter(queue, mode),
      (queue, result) => {
        if (result?.filter === 'off') {
          return success('', '`filter`\nAudio filters are now **off**.', {
            color: MUSIC_PANEL_COLOR
          });
        }

        return success('', `\`filter\`\nApplied **${escapeMarkdown(result.filter)}**. Active: ${activeFilters(queue)}.`, {
          color: MUSIC_PANEL_COLOR
        });
      }
    );
  }

  if (normalized === 'settings.announce') {
    return success('', '`settings`\nTrack announcements are controlled with `MUSIC_ANNOUNCE_TRACKS=true` in your env.');
  }

  if (normalized === 'settings' || normalized.startsWith('settings.')) {
    const settings = await getMusicSettings(guildId).catch(() => null);
    return success('', [
      '`settings`',
      `24/7: **${settings?.stay247 ? 'on' : 'off'}**`,
      `Default volume: **${settings?.defaultVolume || Number(process.env.MUSIC_DEFAULT_VOLUME || 75)}%**`,
      'Use `247 on/off`, `volume <number>`, `loop`, `autoplay`, and `filter`.'
    ].join('\n'), {
      color: MUSIC_PANEL_COLOR
    });
  }

  if (['panel', 'export', 'import', 'node.failover'].includes(normalized)) {
    return success('', '`music`\nThis sidecar-era utility is not needed with the Node backend.');
  }

  return failure(
    'Unknown music command.',
    `The Node backend does not recognize \`${command}\`.`,
    'music_unknown_command'
  );
}

function musicInteractionPayload(interaction, payload) {
  const type = payload?.ok === false ? 'bad' : 'info';
  const footer = payload?.footer
    ? {
        text: String(payload.footer.text || '').slice(0, 2048),
        iconURL: payload.footer.icon_url || payload.footer.iconURL || undefined
      }
    : undefined;

  const output = respond.buildPayload(type, interaction.user, null, {
    mentionUser: false,
    allowTitle: false,
    description: payload?.description || payload?.error || 'Music updated.',
    thumbnail: typeof payload?.thumbnail === 'string' ? payload.thumbnail : payload?.thumbnail?.url,
    footer,
    color: payload?.color || (type === 'bad' ? ERROR_COLOR : MUSIC_PANEL_COLOR),
    components: payload?.components || [],
    message: {
      member: interaction.member,
      guild: interaction.guild
    },
    allowedMentions: { parse: [] }
  });

  return output;
}

async function handleMusicInteraction(interaction) {
  if (!interaction.isButton?.() || !interaction.customId?.startsWith('music:')) return false;
  if (!interaction.guildId) return false;

  const action = interaction.customId.split(':')[1];
  const command = ['pause', 'resume', 'skip', 'stop', 'queue'].includes(action) ? action : null;
  if (!command) return false;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => null);

  const options = {
    userId: interaction.user.id,
    textChannelId: interaction.channelId,
    voiceChannelId: interaction.member?.voice?.channelId || interaction.member?.voice?.channel?.id || null
  };

  const payload = command === 'queue'
    ? await minimalQueuePayload(interaction.guildId)
    : await runCommand(interaction.guildId, command, options);

  await interaction.editReply(musicInteractionPayload(interaction, payload)).catch(() => null);

  if (payload?.ok && command !== 'queue') {
    const state = await getState(interaction.guildId).catch(() => null);
    if (state?.ok) {
      const editPayload = musicInteractionPayload(interaction, state);
      await interaction.message?.edit?.(editPayload).catch(() => null);
    }
  }

  return true;
}

module.exports = {
  getState,
  handleMusicInteraction,
  health,
  initializeMusicPlayer,
  isNodeMusicEnabled,
  runCommand
};
