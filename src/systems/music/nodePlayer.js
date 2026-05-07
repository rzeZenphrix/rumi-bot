const { ChannelType } = require('discord.js');
const { Player, QueueRepeatMode } = require('discord-player');
const { DefaultExtractors } = require('@discord-player/extractor');
process.env.DOTENV_CONFIG_QUIET = process.env.DOTENV_CONFIG_QUIET || 'true';
const { YoutubeExtractor } = require('discord-player-youtube');

const logger = require('../logging/logger');

const MUSIC_COLOR = 0x7c9cff;
const ERROR_COLOR = 0xff6b7a;

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

function success(title, description, extra = {}) {
  return {
    ok: true,
    title,
    description,
    color: MUSIC_COLOR,
    ...extra
  };
}

function failure(error, detail, code = 'music_node_error') {
  return {
    ok: false,
    code,
    error,
    detail,
    color: ERROR_COLOR
  };
}

function formatTrack(track) {
  if (!track) return 'Nothing playing';
  const title = track.title || track.cleanTitle || track.raw?.title || 'Unknown track';
  const url = track.url || track.raw?.url;
  const author = track.author || track.raw?.author || track.raw?.artist;
  const label = url ? `[${title}](${url})` : `**${title}**`;
  return author ? `${label}\nby ${author}` : label;
}

function trackDuration(track) {
  return track?.duration || track?.durationMS && msToDuration(track.durationMS) || 'Live/unknown';
}

function msToDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function parseDuration(input) {
  const value = String(input || '').trim().toLowerCase();
  if (!value) return null;

  if (/^\d+$/.test(value)) return Number(value) * 1000;

  if (/^\d{1,2}(:\d{1,2}){1,2}$/.test(value)) {
    const parts = value.split(':').map(Number);
    const seconds = parts.pop() || 0;
    const minutes = parts.pop() || 0;
    const hours = parts.pop() || 0;
    return ((hours * 3600) + (minutes * 60) + seconds) * 1000;
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
    return { error: failure('Music is still starting.', 'Try again in a few seconds.', 'music_not_initialized') };
  }

  const guild = clientRef.guilds.cache.get(guildId) || await clientRef.guilds.fetch(guildId).catch(() => null);
  if (!guild) {
    return { error: failure('I could not find that server.', 'The music request had an invalid guild ID.', 'music_invalid_guild') };
  }

  const voiceChannelId = options.voiceChannelId;
  const voiceChannel = voiceChannelId
    ? guild.channels.cache.get(voiceChannelId) || await guild.channels.fetch(voiceChannelId).catch(() => null)
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
    return failure('Join a voice channel first.', 'I need to know where to play music.', 'music_no_voice_channel');
  }

  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(voiceChannel.type)) {
    return failure('That is not a playable voice channel.', 'Join a voice or stage channel first.', 'music_invalid_voice_channel');
  }

  const me = voiceChannel.guild.members.me;
  const permissions = me ? voiceChannel.permissionsFor(me) : null;
  if (permissions && (!permissions.has('Connect') || !permissions.has('Speak'))) {
    return failure('I cannot play in that voice channel.', 'I need Connect and Speak permissions.', 'music_missing_voice_permissions');
  }

  return null;
}

async function loadExtractors() {
  if (!player) return;
  if (extractorLoadPromise) return extractorLoadPromise;

  extractorLoadPromise = (async () => {
    await player.extractors.loadMulti(DefaultExtractors).catch((error) => {
      logger.warn({ error }, 'Default music extractors failed to load');
    });

    await player.extractors.register(YoutubeExtractor, {}).catch((error) => {
      logger.warn({ error }, 'YouTube music extractor failed to load');
    });
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
    ytdlOptions: {
      quality: 'highestaudio',
      highWaterMark: 1 << 25
    }
  });

  client.rumiMusicPlayer = player;

  player.events.on('playerStart', (queue, track) => {
    const channel = queue.metadata?.channel;
    if (!channel?.send || envFlag('MUSIC_ANNOUNCE_TRACKS', false) === false) return;
    channel.send({
      embeds: [{
        color: MUSIC_COLOR,
        description: `Now playing ${formatTrack(track)}`,
        thumbnail: track.thumbnail ? { url: track.thumbnail } : undefined
      }]
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
    return success('Music Status', 'Nothing is currently playing in this server.', {
      fields: [
        { name: 'Backend', value: 'Node / discord-player', inline: true },
        { name: 'Extractors', value: String(player?.extractors?.size || 0), inline: true }
      ]
    });
  }

  const tracks = queueTracks(queue);
  return success('Music Status', formatTrack(queue.currentTrack), {
    thumbnail: queue.currentTrack?.thumbnail || null,
    fields: [
      { name: 'State', value: queue.node?.isPaused?.() ? 'Paused' : 'Playing', inline: true },
      { name: 'Volume', value: `${queue.node?.volume ?? 100}%`, inline: true },
      { name: 'Queue', value: `${tracks.length} waiting`, inline: true }
    ]
  });
}

async function play(guildId, options = {}) {
  await loadExtractors();
  const query = String(options.query || '').trim();
  if (!query) {
    return failure('Tell me what to play.', 'Use `play <song name or URL>`.', 'music_missing_query');
  }

  const context = await resolveContext(guildId, options);
  if (context.error) return context.error;
  const voiceError = voiceChannelError(context.voiceChannel);
  if (voiceError) return voiceError;

  try {
    const result = await player.play(context.voiceChannel, query, {
      requestedBy: context.user || undefined,
      nodeOptions: {
        metadata: {
          channel: context.textChannel,
          requestedBy: context.user || null
        },
        volume: Number(process.env.MUSIC_DEFAULT_VOLUME || 75),
        leaveOnEmpty: true,
        leaveOnEmptyCooldown: Number(process.env.MUSIC_EMPTY_LEAVE_MS || 60000),
        leaveOnEnd: false,
        leaveOnStop: false,
        selfDeaf: true
      }
    });

    const queue = result.queue || getQueue(guildId);
    const tracks = queueTracks(queue);
    const track = result.track || queue?.currentTrack;
    const isPlaylist = Boolean(result.playlist);
    const playlistSize = result.playlist?.tracks?.length || 0;

    return success(
      isPlaylist ? 'Queued Playlist' : 'Queued Track',
      isPlaylist
        ? `Added **${result.playlist.title || 'playlist'}** with **${playlistSize}** tracks.`
        : `Added ${formatTrack(track)}.`,
      {
        thumbnail: track?.thumbnail || result.playlist?.thumbnail || null,
        fields: [
          { name: 'Duration', value: trackDuration(track), inline: true },
          { name: 'Requested by', value: context.user ? `<@${context.user.id}>` : 'N/A', inline: true },
          { name: 'Queue', value: `${tracks.length} waiting`, inline: true }
        ]
      }
    );
  } catch (error) {
    logger.warn({ guildId, query, error }, 'Node music play failed');
    return failure('I could not start playback.', error.message || 'The selected source could not be played.', 'music_play_failed');
  }
}

async function search(guildId, options = {}) {
  await loadExtractors();
  const query = String(options.query || '').trim();
  if (!query) {
    return failure('Tell me what to search for.', 'Use `musicsearch <song name or URL>`.', 'music_missing_query');
  }

  const context = await resolveContext(guildId, options);
  if (context.error) return context.error;

  try {
    const result = await player.search(query, {
      requestedBy: context.user || undefined
    });

    const tracks = result?.tracks || [];
    if (!tracks.length) {
      return failure('No music results found.', 'Try a more specific song, artist, or URL.', 'music_no_results');
    }

    return success('Music Search', `Top results for **${query}**`, {
      thumbnail: tracks[0]?.thumbnail || null,
      fields: [
        {
          name: 'Results',
          value: tracks.slice(0, 8).map((track, index) => `${index + 1}. ${track.title || 'Unknown track'} - ${track.author || 'Unknown artist'} (${trackDuration(track)})`).join('\n'),
          inline: false
        }
      ],
      footer: 'Use play <song name or URL> to queue a result.'
    });
  } catch (error) {
    logger.warn({ guildId, query, error }, 'Node music search failed');
    return failure('I could not search music right now.', error.message || 'The music source did not return results.', 'music_search_failed');
  }
}

async function queuePayload(guildId) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const tracks = queueTracks(queue);
  const lines = tracks.slice(0, 10).map((track, index) => `${index + 1}. ${track.title || 'Unknown track'} (${trackDuration(track)})`);
  return success('Queue', formatTrack(queue.currentTrack), {
    thumbnail: queue.currentTrack?.thumbnail || null,
    fields: [
      { name: 'Now playing', value: formatTrack(queue.currentTrack), inline: false },
      {
        name: `Up next (${tracks.length})`,
        value: lines.length ? lines.join('\n') : 'Nothing else queued.',
        inline: false
      }
    ],
    footer: tracks.length > 10 ? `Showing 10 of ${tracks.length} queued tracks` : undefined
  });
}

async function nowPlaying(guildId) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;

  const timestamp = queue.node?.getTimestamp?.();
  const progress = queue.node?.createProgressBar?.({ timecodes: true }) || null;
  return success('Now Playing', formatTrack(queue.currentTrack), {
    thumbnail: queue.currentTrack?.thumbnail || null,
    fields: [
      { name: 'Progress', value: progress || `${msToDuration(timestamp?.current?.value || 0)} / ${trackDuration(queue.currentTrack)}`, inline: false },
      { name: 'Volume', value: `${queue.node?.volume ?? 100}%`, inline: true },
      { name: 'Loop', value: repeatModeName(queue.repeatMode), inline: true }
    ]
  });
}

function repeatModeName(mode) {
  if (mode === QueueRepeatMode.TRACK) return 'Track';
  if (mode === QueueRepeatMode.QUEUE) return 'Queue';
  if (mode === QueueRepeatMode.AUTOPLAY) return 'Autoplay';
  return 'Off';
}

async function runQueueAction(guildId, action, onDone) {
  const { queue, error } = requireQueue(guildId);
  if (error) return error;
  const result = await action(queue);
  if (result?.ok === false) return result;
  return onDone(queue, result);
}

async function runCommand(guildId, command, options = {}) {
  if (!player && clientRef) await initializeMusicPlayer(clientRef);
  if (!player) return failure('Music is not initialized.', 'The Node music backend has not started yet.', 'music_not_initialized');

  const normalized = String(command || '').toLowerCase();

  if (normalized === 'play') return play(guildId, options);
  if (normalized === 'search') return search(guildId, options);
  if (normalized === 'status') return getState(guildId);
  if (normalized === 'queue') return queuePayload(guildId);
  if (normalized === 'nowplaying' || normalized === 'np') return nowPlaying(guildId);

  if (normalized === 'pause') {
    return runQueueAction(guildId, (queue) => queue.node.pause(), () => success('Paused', 'Playback is paused.'));
  }

  if (normalized === 'resume') {
    return runQueueAction(guildId, (queue) => queue.node.resume(), () => success('Resumed', 'Playback is live again.'));
  }

  if (normalized === 'skip') {
    return runQueueAction(guildId, (queue) => queue.node.skip(), (queue) => success('Skipped', queue.currentTrack ? `Now playing ${formatTrack(queue.currentTrack)}.` : 'Skipped the current track.'));
  }

  if (normalized === 'stop' || normalized === 'leave') {
    return runQueueAction(guildId, (queue) => {
      queue.delete();
      return true;
    }, () => success(normalized === 'leave' ? 'Disconnected' : 'Stopped', 'Playback stopped and the queue was cleared.'));
  }

  if (normalized === 'clear') {
    return runQueueAction(guildId, (queue) => {
      queue.clear();
      return true;
    }, () => success('Queue Cleared', 'Removed every waiting track.'));
  }

  if (normalized === 'shuffle') {
    return runQueueAction(guildId, (queue) => queue.toggleShuffle(false), (queue) => success('Shuffle', `Shuffle is now **${queue.isShuffling ? 'on' : 'off'}**.`));
  }

  if (normalized === 'volume' || normalized === 'settings.volume') {
    const value = Math.max(0, Math.min(150, Number.parseInt(String(options.value || ''), 10)));
    if (!Number.isFinite(value)) return failure('Invalid volume.', 'Use a number from 0 to 150.', 'music_invalid_volume');
    return runQueueAction(guildId, (queue) => queue.node.setVolume(value), () => success('Volume Updated', `Volume is now **${value}%**.`));
  }

  if (normalized === 'seek') {
    const ms = parseDuration(options.position);
    if (!ms && ms !== 0) return failure('Invalid seek position.', 'Use `1:30`, `90`, or `2m30s`.', 'music_invalid_seek');
    return runQueueAction(guildId, (queue) => queue.node.seek(ms), () => success('Seeked', `Jumped to **${msToDuration(ms)}**.`));
  }

  if (normalized === 'remove') {
    const index = oneBasedIndex(options.index);
    if (index === null) return failure('Invalid queue number.', 'Use the number shown in `queue`.', 'music_invalid_index');
    return runQueueAction(guildId, (queue) => {
      const removed = queue.node.remove(index);
      return removed ? { removed } : failure('I could not remove that track.', 'That queue number does not exist.', 'music_invalid_index');
    }, (_, result) => success('Removed Track', `Removed **${result.removed.title || 'track'}** from the queue.`));
  }

  if (normalized === 'move') {
    const from = oneBasedIndex(options.from);
    const to = oneBasedIndex(options.to);
    if (from === null || to === null) return failure('Invalid queue numbers.', 'Use numbers shown in `queue`.', 'music_invalid_index');
    return runQueueAction(guildId, (queue) => {
      queue.node.move(from, to);
      return true;
    }, () => success('Moved Track', `Moved track **${from + 1}** to position **${to + 1}**.`));
  }

  if (normalized === 'skipto') {
    const index = oneBasedIndex(options.index);
    if (index === null) return failure('Invalid queue number.', 'Use the number shown in `queue`.', 'music_invalid_index');
    return runQueueAction(guildId, (queue) => queue.node.skipTo(index), () => success('Skipped Ahead', `Skipped to track **${index + 1}**.`));
  }

  if (normalized.startsWith('loop.')) {
    const mode = normalized.split('.')[1];
    const repeat = mode === 'track'
      ? QueueRepeatMode.TRACK
      : mode === 'queue'
        ? QueueRepeatMode.QUEUE
        : QueueRepeatMode.OFF;
    return runQueueAction(guildId, (queue) => {
      queue.setRepeatMode(repeat);
      return true;
    }, () => success('Loop Updated', `Loop mode is now **${repeatModeName(repeat)}**.`));
  }

  if (normalized === 'autoplay' || normalized === 'settings.autoplay') {
    const enabled = String(options.enabled || '').toLowerCase() !== 'off';
    return runQueueAction(guildId, (queue) => {
      queue.setRepeatMode(enabled ? QueueRepeatMode.AUTOPLAY : QueueRepeatMode.OFF);
      return true;
    }, () => success('Autoplay Updated', `Autoplay is now **${enabled ? 'on' : 'off'}**.`));
  }

  if (normalized === 'stats') {
    const stats = player.generateStatistics?.();
    return success('Music Stats', 'Node music backend is running.', {
      fields: [
        { name: 'Queues', value: String(player.nodes?.cache?.size || player.queues?.cache?.size || 0), inline: true },
        { name: 'Extractors', value: String(player.extractors?.size || 0), inline: true },
        { name: 'Backend', value: 'discord-player', inline: true },
        ...(stats?.eventLoopLag ? [{ name: 'Event loop', value: `${Math.round(stats.eventLoopLag)}ms`, inline: true }] : [])
      ]
    });
  }

  if (normalized === 'history') {
    return runQueueAction(guildId, (queue) => {
      const previous = queue.history?.tracks?.toArray?.() || [];
      return { previous };
    }, (_, result) => success('Music History', result.previous.slice(-10).reverse().map((track, i) => `${i + 1}. ${track.title || 'Unknown track'}`).join('\n') || 'No recent tracks in this queue.'));
  }

  if (normalized === 'lyrics') {
    return success('Lyrics', 'Lyrics lookup is not available in the Node backend yet. Playback commands are live now, and lyrics can be added as a smaller follow-up.');
  }

  if (normalized.startsWith('filter.')) {
    return success('Filters', 'Audio filters are not enabled in the Node backend yet, so playback stays stable on Render.');
  }

  if (normalized.startsWith('settings.') || normalized === 'settings') {
    return success('Music Settings', 'Runtime music settings are handled by the Node backend now. Use `volume`, `loop`, and `autoplay` directly while persistent DJ settings are rebuilt.');
  }

  if (['panel', 'export', 'import', 'node.failover'].includes(normalized)) {
    return success('Music', 'This sidecar-era utility is not needed with the Node backend.');
  }

  return failure('Unknown music command.', `The Node backend does not recognize \`${command}\`.`, 'music_unknown_command');
}

module.exports = {
  getState,
  health,
  initializeMusicPlayer,
  isNodeMusicEnabled,
  runCommand
};
