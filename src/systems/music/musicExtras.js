const db = require('../../services/database');
const musicService = require('../../services/musicService');

const MAX_PLAYLISTS = Number(process.env.MUSIC_MAX_PLAYLISTS_PER_USER || 20);
const MAX_TRACKS = Number(process.env.MUSIC_MAX_TRACKS_PER_PLAYLIST || 75);

const RADIOS = {
  lofi: 'lofi hip hop radio beats to relax study to',
  chill: 'chill mix aesthetic night drive',
  anime: 'anime openings playlist',
  nightcore: 'nightcore mix playlist',
  phonk: 'phonk drift mix',
  sad: 'sad slowed reverb playlist',
  gym: 'gym workout hype playlist',
  afro: 'afrobeats party mix',
  pop: 'pop hits playlist',
  jazz: 'smooth jazz cafe playlist',
  ambient: 'dark ambient study music',
  piano: 'soft piano sleep music'
};

const VIBES = {
  lofi: { volume: 55, filter: 'lofi', radio: 'lofi' },
  chill: { volume: 60, filter: 'vaporwave', radio: 'chill' },
  anime: { volume: 75, filter: 'nightcore', radio: 'anime' },
  nightcore: { volume: 75, filter: 'nightcore', radio: 'nightcore' },
  gym: { volume: 90, filter: 'bassboost', radio: 'gym' },
  phonk: { volume: 85, filter: 'bassboost', radio: 'phonk' },
  sad: { volume: 55, filter: 'vaporwave', radio: 'sad' },
  focus: { volume: 45, filter: 'lofi', radio: 'ambient' },
  clean: { volume: 75, filter: 'off', radio: null }
};

function playlistNamespace(guildId) {
  return `music:playlists:${guildId}`;
}

function profileNamespace(guildId) {
  return `music:profiles:${guildId}`;
}

function settingsNamespace(guildId) {
  return `music:settings:${guildId}`;
}

function normalizeName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32);
}

function cleanQuery(value) {
  return String(value || '').trim().slice(0, 300);
}

function nowIso() {
  return new Date().toISOString();
}

async function getUserPlaylists(guildId, userId) {
  return db.getKv(playlistNamespace(guildId), userId, { playlists: {} });
}

async function saveUserPlaylists(guildId, userId, data) {
  return db.setKv(playlistNamespace(guildId), userId, data);
}

async function getPlaylist(guildId, userId, name) {
  const data = await getUserPlaylists(guildId, userId);
  return data.playlists?.[normalizeName(name)] || null;
}

async function upsertPlaylist(guildId, userId, name, updater) {
  const cleanName = normalizeName(name);
  if (!cleanName) return { error: 'Invalid playlist name.' };

  const data = await getUserPlaylists(guildId, userId);
  data.playlists ||= {};

  const exists = data.playlists[cleanName];

  if (!exists && Object.keys(data.playlists).length >= MAX_PLAYLISTS) {
    return { error: `Playlist limit reached: ${MAX_PLAYLISTS}.` };
  }

  const base = exists || {
    name: cleanName,
    tracks: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  const next = updater(base);
  if (next?.error) return next;

  next.name = cleanName;
  next.updatedAt = nowIso();
  data.playlists[cleanName] = next;

  await saveUserPlaylists(guildId, userId, data);

  return { playlist: next, data };
}

async function deletePlaylist(guildId, userId, name) {
  const cleanName = normalizeName(name);
  const data = await getUserPlaylists(guildId, userId);

  if (!data.playlists?.[cleanName]) return false;

  delete data.playlists[cleanName];
  await saveUserPlaylists(guildId, userId, data);

  return true;
}

function exportPlaylist(playlist) {
  const payload = {
    name: playlist.name,
    tracks: playlist.tracks || [],
    exportedAt: nowIso()
  };

  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function importPlaylist(code) {
  try {
    const payload = JSON.parse(Buffer.from(String(code || ''), 'base64url').toString('utf8'));
    const tracks = Array.isArray(payload.tracks)
      ? payload.tracks.map(cleanQuery).filter(Boolean).slice(0, MAX_TRACKS)
      : [];

    return tracks.length
      ? {
          name: normalizeName(payload.name || 'imported'),
          tracks
        }
      : null;
  } catch {
    return null;
  }
}

async function getGuildSettings(guildId) {
  return db.getKv(settingsNamespace(guildId), 'config', {
    stay247: false,
    defaultVolume: Number(process.env.MUSIC_DEFAULT_VOLUME || 75)
  });
}

async function setStay247(guildId, enabled, userId) {
  const settings = await getGuildSettings(guildId);

  settings.stay247 = Boolean(enabled);
  settings.updatedBy = userId;
  settings.updatedAt = nowIso();

  await db.setKv(settingsNamespace(guildId), 'config', settings);

  return settings;
}

async function recordMusicPlay(guildId, userId, data = {}) {
  if (!guildId || !userId) return null;

  const profile = await db.getKv(profileNamespace(guildId), userId, {
    plays: 0,
    radioPlays: 0,
    vibeUses: 0,
    playlistQueues: 0,
    topQueries: {},
    lastQuery: null,
    lastPlayedAt: null,
    createdAt: nowIso()
  });

  profile.plays += 1;
  profile.lastPlayedAt = nowIso();

  const query = cleanQuery(data.query || data.radio || data.vibe || data.playlist || 'unknown');

  profile.lastQuery = query;
  profile.topQueries ||= {};
  profile.topQueries[query] = (profile.topQueries[query] || 0) + 1;

  if (data.type === 'radio') profile.radioPlays += 1;
  if (data.type === 'vibe') profile.vibeUses += 1;
  if (data.type === 'playlist') profile.playlistQueues += 1;

  await db.setKv(profileNamespace(guildId), userId, profile);

  return profile;
}

async function getMusicProfile(guildId, userId) {
  return db.getKv(profileNamespace(guildId), userId, null);
}

async function playQuery(message, query, type = 'play') {
  const voiceChannel = message.member?.voice?.channel;

  if (!voiceChannel) {
    return {
      ok: false,
      error: 'Join a voice channel first.'
    };
  }

  const payload = await musicService.runCommand(message.guild.id, 'play', {
    query,
    userId: message.author.id,
    textChannelId: message.channel.id,
    voiceChannelId: voiceChannel.id
  });

  if (payload?.ok) {
    await recordMusicPlay(message.guild.id, message.author.id, { type, query }).catch(() => null);
  }

  return payload;
}

module.exports = {
  MAX_PLAYLISTS,
  MAX_TRACKS,
  RADIOS,
  VIBES,
  normalizeName,
  cleanQuery,
  getUserPlaylists,
  getPlaylist,
  upsertPlaylist,
  deletePlaylist,
  exportPlaylist,
  importPlaylist,
  getGuildSettings,
  setStay247,
  recordMusicPlay,
  getMusicProfile,
  playQuery
};