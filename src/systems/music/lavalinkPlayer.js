const WebSocket = require('ws');
const { ChannelType, GatewayOpcodes, PermissionFlagsBits } = require('discord.js');

const logger = require('../logging/logger');
const db = require('../../services/database');

const DEFAULT_SEARCH_PREFIXES = 'ytsearch:,ytmsearch:';
const CLIENT_NAME = 'rumi-lavalink/2.0.0';
const INVISIBLE = '\u200B';

let manager = null;
let clientRef = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

function isLavalinkEnabled() {
  const backend = String(process.env.MUSIC_BACKEND || '').trim().toLowerCase();
  if (backend) return backend === 'lavalink';
  return envFlag('LAVALINK_ENABLED', Boolean(process.env.LAVALINK_URL && process.env.LAVALINK_PASSWORD));
}

function configuredNodes() {
  return String(process.env.LAVALINK_NODES || process.env.LAVALINK_URL || 'http://localhost:2333')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function baseUrl() {
  return configuredNodes()[0] || 'http://localhost:2333';
}

function wsUrlFromBase(url) {
  const trimmed = String(url || '').replace(/\/+$/, '');
  if (/^wss?:\/\//i.test(trimmed)) return `${trimmed}/v4/websocket`;
  const protocol = trimmed.startsWith('https://') ? 'wss://' : 'ws://';
  const host = trimmed.replace(/^https?:\/\//i, '');
  return `${protocol}${host}/v4/websocket`;
}

function lavalinkPassword() {
  return String(process.env.LAVALINK_PASSWORD || process.env.LAVALINK_PASS || 'youshallnotpass');
}

function truncate(value, max = 1024) {
  const text = String(value ?? '').trim();
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
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
  delete next.color;
  return next;
}

function ok(description, extra = {}) {
  return cleanPayload({ ok: true, replyType: 'good', description: truncate(description, 4096), ...extra });
}

function panel(description, extra = {}) {
  return cleanPayload({ ok: true, replyType: 'info', description: truncate(description, 4096), ...extra });
}

function fail(error, detail, code = 'music_lavalink_error') {
  return cleanPayload({
    ok: false,
    code,
    error,
    detail,
    replyType: 'bad',
    description: `**${escapeMarkdown(error)}**\n${escapeMarkdown(detail || '')}`.trim()
  });
}

function toThumbnail(url) {
  return url ? { url } : undefined;
}

function toFooter(text) {
  return text ? { text: truncate(text, 200) } : undefined;
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || '').trim());
}

function looksLikeSearchIdentifier(value) {
  return /^[a-z0-9_-]+search:/i.test(String(value || ''));
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

function msToDuration(ms) {
  if (!Number.isFinite(Number(ms)) || Number(ms) <= 0) return 'Unknown';
  const totalSeconds = Math.floor(Number(ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function oneBasedIndex(raw) {
  const index = Number.parseInt(String(raw || ''), 10);
  return Number.isFinite(index) && index > 0 ? index - 1 : null;
}

function boolFromOnOff(value, fallback = false) {
  const raw = String(value || '').trim().toLowerCase();
  if (['on', 'enable', 'enabled', 'true', 'yes', '1'].includes(raw)) return true;
  if (['off', 'disable', 'disabled', 'false', 'no', '0'].includes(raw)) return false;
  return fallback;
}

function trackTitle(track) {
  return track?.info?.title || track?.title || 'Unknown track';
}

function trackAuthor(track) {
  return track?.info?.author || track?.author || null;
}

function trackUrl(track) {
  return track?.info?.uri || track?.url || null;
}

function trackThumbnail(track) {
  return track?.info?.artworkUrl || track?.pluginInfo?.artworkUrl || track?.thumbnail || null;
}

function trackDuration(track) {
  if (track?.info?.isStream) return 'Live';
  return msToDuration(track?.info?.length || track?.durationMS || 0);
}

function trackSource(track) {
  const raw = String(track?.info?.sourceName || track?.sourceName || '').toLowerCase();
  if (raw.includes('youtube')) return 'YouTube';
  if (raw.includes('soundcloud')) return 'SoundCloud';
  if (raw.includes('bandcamp')) return 'Bandcamp';
  if (raw.includes('vimeo')) return 'Vimeo';
  if (raw.includes('http')) return 'Direct link';
  return raw || 'Lavalink';
}

function formatTrack(track, compact = false) {
  if (!track) return 'Nothing playing.';
  const title = truncate(trackTitle(track), compact ? 70 : 100);
  const author = trackAuthor(track);
  const url = trackUrl(track);
  const label = url ? `[${escapeLinkLabel(title)}](${url})` : `**${escapeMarkdown(title)}**`;
  return author ? `${label}${compact ? ' — ' : '\n'}${escapeMarkdown(author)}` : label;
}

function queueLine(track, index) {
  return `\`${index + 1}\` ${formatTrack(track, true)} \`${trackDuration(track)}\``;
}

function fitLines(lines, max = 3900) {
  const output = [];
  let used = 0;
  for (const line of lines) {
    const next = String(line || '').trim();
    if (!next) continue;
    if (used + next.length + 1 > max) break;
    output.push(next);
    used += next.length + 1;
  }
  return output.join('\n') || INVISIBLE;
}

function compactFooter(state, extras = []) {
  return [
    'Lavalink',
    state?.queue?.length ? `${state.queue.length} waiting` : '0 waiting',
    `Vol ${state?.volume ?? envNumber('MUSIC_DEFAULT_VOLUME', 65)}%`,
    state?.loopMode && state.loopMode !== 'off' ? `Loop ${state.loopMode}` : null,
    state?.autoplay ? 'Autoplay on' : null,
    ...extras
  ].filter(Boolean).join(' · ');
}

function normalizeTrack(track, requestedBy = null) {
  if (!track) return null;
  return {
    encoded: track.encoded,
    info: track.info || {},
    pluginInfo: track.pluginInfo || {},
    userData: {
      ...(track.userData || {}),
      requestedBy: requestedBy || track.userData?.requestedBy || null
    }
  };
}

function filterPayload(mode) {
  const name = String(mode || '').trim().toLowerCase();
  if (!name || ['off', 'none', 'clear', 'reset', 'disable', 'disabled'].includes(name)) return {};

  if (name === 'bass' || name === 'bassboost' || name === 'bassboost_high') {
    return { equalizer: [{ band: 0, gain: 0.20 }, { band: 1, gain: 0.15 }, { band: 2, gain: 0.10 }] };
  }
  if (name === 'bassboost_low') return { equalizer: [{ band: 0, gain: 0.10 }, { band: 1, gain: 0.08 }] };
  if (name === 'nightcore') return { timescale: { speed: 1.15, pitch: 1.15, rate: 1.0 } };
  if (name === 'vaporwave' || name === 'lofi') return { timescale: { speed: 0.85, pitch: 0.85, rate: 1.0 } };
  if (name === 'tremolo') return { tremolo: { frequency: 2.0, depth: 0.5 } };
  if (name === 'vibrato') return { vibrato: { frequency: 2.0, depth: 0.5 } };
  if (name === '8d' || name === 'rotation' || name === 'rotate') return { rotation: { rotationHz: 0.2 } };
  if (name === 'lowpass') return { lowPass: { smoothing: 20.0 } };
  if (name === 'karaoke') return { karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } };

  return null;
}

async function getMusicSettings(guildId) {
  return db.getKv(`music:settings:${guildId}`, 'config', {
    stay247: false,
    autoplay: false,
    defaultVolume: envNumber('MUSIC_DEFAULT_VOLUME', 65),
    searchEngine: String(process.env.MUSIC_LAVALINK_SEARCH_PREFIXES || DEFAULT_SEARCH_PREFIXES).toLowerCase()
  });
}

async function saveMusicSettings(guildId, patch = {}) {
  const current = await getMusicSettings(guildId).catch(() => ({
    stay247: false,
    autoplay: false,
    defaultVolume: envNumber('MUSIC_DEFAULT_VOLUME', 65),
    searchEngine: DEFAULT_SEARCH_PREFIXES
  }));
  const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
  await db.setKv(`music:settings:${guildId}`, 'config', next).catch(() => null);
  return next;
}

function queueDataFromState(state) {
  return {
    current: state.current ? {
      title: trackTitle(state.current),
      author: trackAuthor(state.current),
      url: trackUrl(state.current),
      thumbnail: trackThumbnail(state.current),
      duration: trackDuration(state.current),
      source: trackSource(state.current)
    } : null,
    tracks: state.queue.map((track, index) => ({
      index: index + 1,
      title: trackTitle(track),
      author: trackAuthor(track),
      url: trackUrl(track),
      thumbnail: trackThumbnail(track),
      duration: trackDuration(track),
      source: trackSource(track)
    })),
    total: state.queue.length,
    volume: state.volume,
    loop: state.loopMode || 'off',
    filters: state.filters || 'off',
    autoplay: Boolean(state.autoplay),
    paused: Boolean(state.paused),
    playing: Boolean(state.playing),
    position: state.position || 0
  };
}

class LavalinkMusicManager {
  constructor(client) {
    this.client = client;
    this.ws = null;
    this.sessionId = String(process.env.LAVALINK_RESUME_KEY || '').trim() || null;
    this.ready = false;
    this.destroyed = false;
    this.reconnectAttempts = 0;
    this.connectingPromise = null;
    this.stats = null;
    this.nodeInfo = null;
    this.voice = new Map();
    this.players = new Map();
    this.readyResolvers = [];
    this.nodeIndex = 0;
    this.nodes = configuredNodes();

    this.rawListener = (packet) => this.handleRaw(packet);
    this.client.on('raw', this.rawListener);
  }

  activeBaseUrl() {
    return this.nodes[this.nodeIndex] || baseUrl();
  }

  rotateNode() {
    if (this.nodes.length <= 1) return this.activeBaseUrl();
    this.nodeIndex = (this.nodeIndex + 1) % this.nodes.length;
    return this.activeBaseUrl();
  }

  async connect() {
    if (this.ready && this.ws?.readyState === WebSocket.OPEN) return this;
    if (this.connectingPromise) return this.connectingPromise;

    this.connectingPromise = new Promise((resolve, reject) => {
      const url = wsUrlFromBase(this.activeBaseUrl());
      const headers = {
        Authorization: lavalinkPassword(),
        'User-Id': this.client.user.id,
        'Client-Name': CLIENT_NAME
      };
      if (this.sessionId) headers['Session-Id'] = this.sessionId;

      logger.info({ url, node: this.activeBaseUrl() }, 'Connecting to Lavalink');
      const ws = new WebSocket(url, { headers, handshakeTimeout: envNumber('LAVALINK_HANDSHAKE_TIMEOUT_MS', 15000) });
      this.ws = ws;

      const timeout = setTimeout(() => {
        reject(new Error('Timed out while waiting for Lavalink ready event.'));
        try { ws.close(); } catch { /* ignore */ }
      }, envNumber('LAVALINK_READY_TIMEOUT_MS', 20000));

      ws.on('message', (raw) => {
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch (error) {
          logger.warn({ error, raw: raw.toString().slice(0, 500) }, 'Invalid Lavalink websocket message');
          return;
        }

        this.handleMessage(message).catch((error) => {
          logger.warn({ error, message }, 'Lavalink websocket message handling failed');
        });

        if (message.op === 'ready') {
          clearTimeout(timeout);
          resolve(this);
        }
      });

      ws.on('error', (error) => {
        logger.warn({ error, node: this.activeBaseUrl() }, 'Lavalink websocket error');
        if (!this.ready) {
          clearTimeout(timeout);
          reject(error);
        }
      });

      ws.on('close', (code, reason) => {
        clearTimeout(timeout);
        this.ready = false;
        this.connectingPromise = null;
        logger.warn({ code, reason: reason?.toString?.() || '', node: this.activeBaseUrl() }, 'Lavalink websocket closed');
        if (!this.destroyed) this.scheduleReconnect();
      });
    }).finally(() => {
      this.connectingPromise = null;
    });

    return this.connectingPromise;
  }

  scheduleReconnect() {
    const delay = Math.min(30000, 1000 * Math.pow(2, Math.min(this.reconnectAttempts++, 5)));
    setTimeout(() => {
      if (this.destroyed) return;
      this.connect().catch((error) => {
        logger.warn({ error }, 'Lavalink reconnect failed');
        if (this.reconnectAttempts % 3 === 0) this.rotateNode();
        this.scheduleReconnect();
      });
    }, delay).unref?.();
  }

  async handleMessage(message) {
    if (message.op === 'ready') {
      this.ready = true;
      this.reconnectAttempts = 0;
      this.sessionId = message.sessionId;
      logger.info({ sessionId: this.sessionId, resumed: message.resumed }, 'Lavalink ready');
      await this.updateSession().catch((error) => logger.warn({ error }, 'Could not enable Lavalink session resume'));
      this.readyResolvers.splice(0).forEach((resolve) => resolve());
      return;
    }

    if (message.op === 'stats') {
      this.stats = message;
      return;
    }

    if (message.op === 'playerUpdate') {
      const state = this.getPlayer(message.guildId);
      state.position = message.state?.position || 0;
      state.connected = Boolean(message.state?.connected);
      state.ping = message.state?.ping;
      state.lastUpdate = Date.now();
      return;
    }

    if (message.op === 'event') {
      await this.handlePlayerEvent(message);
    }
  }

  async handlePlayerEvent(event) {
    const state = this.getPlayer(event.guildId);

    if (event.type === 'TrackStartEvent') {
      state.playing = true;
      state.paused = false;
      state.lastError = null;
      return;
    }

    if (event.type === 'TrackEndEvent') {
      state.playing = false;
      const reason = String(event.reason || '').toLowerCase();
      if (['replaced', 'cleanup'].includes(reason)) return;
      await this.startNext(event.guildId, reason);
      return;
    }

    if (event.type === 'TrackExceptionEvent' || event.type === 'TrackStuckEvent') {
      state.lastError = event.exception?.message || event.type;
      logger.warn({ guildId: event.guildId, event }, 'Lavalink track failed; skipping');
      await this.startNext(event.guildId, event.type);
      return;
    }

    if (event.type === 'WebSocketClosedEvent') {
      state.connected = false;
      logger.warn({ guildId: event.guildId, event }, 'Lavalink voice websocket closed');
    }
  }

  async updateSession() {
    if (!this.sessionId) return null;
    return this.rest('PATCH', `/v4/sessions/${encodeURIComponent(this.sessionId)}`, {
      resuming: true,
      timeout: envNumber('LAVALINK_RESUME_TIMEOUT_SECONDS', 120)
    });
  }

  waitUntilReady(timeoutMs = 20000) {
    if (this.ready && this.sessionId) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Lavalink session is not ready.')), timeoutMs);
      this.readyResolvers.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async rest(method, path, body = null) {
    if (!this.ready || !this.sessionId || this.ws?.readyState !== WebSocket.OPEN) {
      await this.connect();
    }
    await this.waitUntilReady();

    const response = await fetch(`${this.activeBaseUrl()}${path}`, {
      method,
      headers: {
        Authorization: lavalinkPassword(),
        'content-type': 'application/json'
      },
      body: body === null ? undefined : JSON.stringify(body)
    });

    const text = await response.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = text; }
    }

    if (!response.ok) {
      const detail = typeof data === 'object' && data
        ? (data.message || data.error || JSON.stringify(data))
        : (data || `HTTP ${response.status}`);
      throw new Error(`Lavalink REST ${method} ${path} failed: ${detail}`);
    }

    return data;
  }

  async info() {
    try {
      this.nodeInfo = await this.rest('GET', '/v4/info');
    } catch (error) {
      logger.warn({ error }, 'Could not fetch Lavalink info');
    }
    return this.nodeInfo;
  }

  getPlayer(guildId) {
    const id = String(guildId);
    if (!this.players.has(id)) {
      this.players.set(id, {
        guildId: id,
        queue: [],
        history: [],
        current: null,
        voiceChannelId: null,
        textChannelId: null,
        volume: envNumber('MUSIC_DEFAULT_VOLUME', 65),
        paused: false,
        playing: false,
        loopMode: 'off',
        autoplay: false,
        stay247: false,
        filters: 'off',
        position: 0,
        connected: false,
        lastUpdate: null,
        lastError: null
      });
    }
    return this.players.get(id);
  }

  getVoice(guildId) {
    const id = String(guildId);
    if (!this.voice.has(id)) this.voice.set(id, { guildId: id, resolvers: [] });
    return this.voice.get(id);
  }

  handleRaw(packet) {
    const event = packet?.t;
    const data = packet?.d || {};
    if (!event || !data?.guild_id) return;

    if (event === 'VOICE_STATE_UPDATE' && data.user_id === this.client.user?.id) {
      const voice = this.getVoice(data.guild_id);
      voice.sessionId = data.session_id || null;
      voice.channelId = data.channel_id || null;
      if (!voice.channelId) {
        const state = this.getPlayer(data.guild_id);
        state.voiceChannelId = null;
        state.connected = false;
      }
      this.maybeSendVoiceUpdate(data.guild_id).catch((error) => {
        logger.warn({ error, guildId: data.guild_id }, 'VOICE_STATE_UPDATE Lavalink forwarding failed');
      });
    }

    if (event === 'VOICE_SERVER_UPDATE') {
      const voice = this.getVoice(data.guild_id);
      voice.token = data.token;
      voice.endpoint = data.endpoint;
      this.maybeSendVoiceUpdate(data.guild_id).catch((error) => {
        logger.warn({ error, guildId: data.guild_id }, 'VOICE_SERVER_UPDATE Lavalink forwarding failed');
      });
    }
  }

  async maybeSendVoiceUpdate(guildId) {
    const voice = this.getVoice(guildId);
    if (!voice.sessionId || !voice.token || !voice.endpoint) return false;

    await this.updatePlayer(guildId, {
      voice: {
        token: voice.token,
        endpoint: voice.endpoint,
        sessionId: voice.sessionId
      }
    }, true);

    voice.resolvers.splice(0).forEach((resolve) => resolve(true));
    return true;
  }

  async joinVoice(guildId, channelId) {
    const guild = this.client.guilds.cache.get(String(guildId)) || await this.client.guilds.fetch(String(guildId)).catch(() => null);
    if (!guild) throw new Error('I could not find that server.');

    const channel = guild.channels.cache.get(String(channelId)) || await guild.channels.fetch(String(channelId)).catch(() => null);
    if (!channel || ![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type)) {
      throw new Error('Join a voice channel first.');
    }

    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    const permissions = me ? channel.permissionsFor(me) : null;
    if (permissions && (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak))) {
      throw new Error('I need Connect and Speak permissions in that voice channel.');
    }

    const voice = this.getVoice(guildId);
    const state = this.getPlayer(guildId);
    state.voiceChannelId = String(channelId);
    voice.channelId = String(channelId);

    guild.shard.send({
      op: GatewayOpcodes.VoiceStateUpdate,
      d: {
        guild_id: String(guildId),
        channel_id: String(channelId),
        self_mute: false,
        self_deaf: envFlag('MUSIC_SELF_DEAF', true)
      }
    });

    if (voice.sessionId && voice.token && voice.endpoint) {
      await this.maybeSendVoiceUpdate(guildId);
      return true;
    }

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for Discord voice server update.')), envNumber('MUSIC_VOICE_JOIN_TIMEOUT_MS', 15000));
      voice.resolvers.push(() => {
        clearTimeout(timer);
        resolve(true);
      });
    });

    return true;
  }

  async leaveVoice(guildId) {
    const guild = this.client.guilds.cache.get(String(guildId)) || await this.client.guilds.fetch(String(guildId)).catch(() => null);
    if (guild?.shard) {
      guild.shard.send({
        op: GatewayOpcodes.VoiceStateUpdate,
        d: {
          guild_id: String(guildId),
          channel_id: null,
          self_mute: false,
          self_deaf: false
        }
      });
    }
    this.voice.delete(String(guildId));
  }

  async updatePlayer(guildId, payload, noReplace = false) {
    const query = noReplace ? '?noReplace=true' : '?noReplace=false';
    return this.rest('PATCH', `/v4/sessions/${encodeURIComponent(this.sessionId)}/players/${guildId}${query}`, payload);
  }

  async destroyPlayer(guildId) {
    try {
      await this.rest('DELETE', `/v4/sessions/${encodeURIComponent(this.sessionId)}/players/${guildId}`);
    } catch (error) {
      if (!/404|not found|Session not found/i.test(error.message)) throw error;
    }
  }

  searchPrefixes(settings = null) {
    const raw = String(settings?.searchEngine || process.env.MUSIC_LAVALINK_SEARCH_PREFIXES || DEFAULT_SEARCH_PREFIXES)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
    return raw.length ? raw : DEFAULT_SEARCH_PREFIXES.split(',');
  }

  identifiersFor(query, settings = null) {
    const trimmed = String(query || '').trim();
    if (!trimmed) return [];
    if (isUrl(trimmed) || looksLikeSearchIdentifier(trimmed)) return [trimmed];
    return this.searchPrefixes(settings).map((prefix) => `${prefix}${trimmed}`);
  }

  async loadTracks(query, guildId = null) {
    const settings = guildId ? await getMusicSettings(guildId).catch(() => null) : null;
    const identifiers = this.identifiersFor(query, settings);
    const failures = [];

    for (const identifier of identifiers) {
      try {
        const result = await this.rest('GET', `/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`);
        const loadType = String(result?.loadType || '').toLowerCase();
        if (loadType === 'track' && result.data?.encoded) {
          return { type: 'track', tracks: [normalizeTrack(result.data)], playlist: null, identifier };
        }
        if (loadType === 'search' && Array.isArray(result.data) && result.data.length) {
          return { type: 'search', tracks: result.data.map((track) => normalizeTrack(track)).filter(Boolean), playlist: null, identifier };
        }
        if (loadType === 'playlist' && Array.isArray(result.data?.tracks) && result.data.tracks.length) {
          return {
            type: 'playlist',
            tracks: result.data.tracks.map((track) => normalizeTrack(track)).filter(Boolean),
            playlist: result.data.info || { name: 'Playlist' },
            identifier
          };
        }
        if (loadType === 'error') failures.push(result.data?.message || result.data?.cause || `Load failed for ${identifier}`);
      } catch (error) {
        failures.push(error.message);
      }
    }

    return { type: 'empty', tracks: [], playlist: null, failures };
  }

  async playNow(guildId, track) {
    const state = this.getPlayer(guildId);
    const normalized = normalizeTrack(track);
    if (!normalized?.encoded) throw new Error('The selected result had no Lavalink encoded track.');

    if (state.current) state.history.unshift(state.current);
    state.history = state.history.slice(0, 50);
    state.current = normalized;
    state.playing = true;
    state.paused = false;
    state.position = 0;

    await this.updatePlayer(guildId, {
      track: { encoded: normalized.encoded, userData: normalized.userData || {} },
      volume: state.volume,
      paused: false
    });
  }

  async findAutoplayTrack(guildId, finished) {
    const title = trackTitle(finished);
    const author = trackAuthor(finished);
    const seed = [author, title, 'radio'].filter(Boolean).join(' ');
    const result = await this.loadTracks(seed, guildId).catch(() => ({ tracks: [] }));
    const currentUrl = trackUrl(finished);
    return (result.tracks || []).find((track) => trackUrl(track) !== currentUrl) || null;
  }

  async startNext(guildId, reason = '') {
    const state = this.getPlayer(guildId);
    const finished = state.current;
    const cleanReason = String(reason).toLowerCase();

    if (finished && state.loopMode === 'track' && !['loadfailed', 'trackexceptionevent', 'trackstuckevent'].includes(cleanReason)) {
      await this.playNow(guildId, finished).catch((error) => logger.warn({ error, guildId }, 'Failed to replay looped track'));
      return;
    }

    if (finished && state.loopMode === 'queue') state.queue.push(finished);

    let next = state.queue.shift();
    if (!next && state.autoplay && finished) next = await this.findAutoplayTrack(guildId, finished);

    if (next) {
      await this.playNow(guildId, next).catch((error) => logger.warn({ error, guildId }, 'Failed to start next Lavalink track'));
      return;
    }

    state.current = null;
    state.playing = false;
    state.position = 0;
    await this.updatePlayer(guildId, { track: { encoded: null } }).catch(() => null);

    const idleMs = envNumber('MUSIC_IDLE_DESTROY_MS', 180000);
    if (!state.stay247 && idleMs > 0) {
      setTimeout(async () => {
        const latest = this.getPlayer(guildId);
        if (!latest.current && latest.queue.length === 0 && !latest.stay247) {
          await this.destroyPlayer(guildId).catch(() => null);
          await this.leaveVoice(guildId).catch(() => null);
        }
      }, idleMs).unref?.();
    }
  }

  async add(guildId, tracks, options = {}) {
    const state = this.getPlayer(guildId);
    const requestedBy = options.userId || null;
    const normalized = tracks.map((track) => normalizeTrack(track, requestedBy)).filter(Boolean);
    if (!normalized.length) throw new Error('No playable tracks were returned.');

    if (options.textChannelId) state.textChannelId = String(options.textChannelId);
    if (options.voiceChannelId) await this.joinVoice(guildId, options.voiceChannelId);

    if (!state.current) {
      const first = normalized.shift();
      state.queue.push(...normalized);
      await this.playNow(guildId, first);
      return { started: first, added: normalized, state };
    }

    state.queue.push(...normalized);
    return { started: null, added: normalized, state };
  }
}

async function initializeMusicPlayer(client) {
  if (!isLavalinkEnabled()) {
    logger.info('Lavalink music backend is disabled.');
    return null;
  }

  if (manager) return manager;
  clientRef = client;
  manager = new LavalinkMusicManager(client);
  client.rumiLavalink = manager;

  const attempts = envNumber('LAVALINK_STARTUP_ATTEMPTS', 5);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await manager.connect();
      await manager.info();
      return manager;
    } catch (error) {
      logger.warn({ error, attempt, attempts }, 'Lavalink startup connection failed');
      if (attempt < attempts) await sleep(Math.min(15000, 2000 * attempt));
    }
  }

  manager.scheduleReconnect();
  return manager;
}

async function ensureManager() {
  if (!manager && clientRef) await initializeMusicPlayer(clientRef);
  if (!manager) throw new Error('Lavalink manager has not been initialized yet.');
  if (!manager.ready) await manager.connect();
  return manager;
}

async function resolveContext(guildId, options = {}) {
  if (!clientRef) return { error: fail('Music is still starting.', 'Try again in a few seconds.', 'music_not_initialized') };
  const guild = clientRef.guilds.cache.get(String(guildId)) || await clientRef.guilds.fetch(String(guildId)).catch(() => null);
  if (!guild) return { error: fail('I could not find that server.', 'The music request had an invalid guild ID.', 'music_invalid_guild') };
  const voiceChannel = options.voiceChannelId
    ? guild.channels.cache.get(String(options.voiceChannelId)) || await guild.channels.fetch(String(options.voiceChannelId)).catch(() => null)
    : null;
  return { guild, voiceChannel };
}

function voiceChannelError(voiceChannel) {
  if (!voiceChannel) return fail('Join a voice channel first.', 'I need to know where to play music.', 'music_no_voice_channel');
  if (![ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(voiceChannel.type)) {
    return fail('That is not a playable voice channel.', 'Join a voice or stage channel first.', 'music_invalid_voice_channel');
  }
  const me = voiceChannel.guild.members.me;
  const permissions = me ? voiceChannel.permissionsFor(me) : null;
  if (permissions && (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.Speak))) {
    return fail('I cannot play in that voice channel.', 'I need Connect and Speak permissions.', 'music_missing_voice_permissions');
  }
  return null;
}

function requireQueue(guildId) {
  if (!manager) return { error: fail('Music is not initialized.', 'The Lavalink backend has not started yet.', 'music_not_initialized') };
  const state = manager.getPlayer(guildId);
  if (!state.current && !state.queue.length) {
    return { error: fail('Nothing is playing.', 'Start something with `play <song or URL>` first.', 'music_no_queue') };
  }
  return { state };
}

function playbackState(state) {
  if (!state?.current) return 'Idle';
  if (state.paused) return 'Paused';
  if (state.playing) return 'Playing';
  return 'Ready';
}

function progressLine(state) {
  if (!state?.current) return '`──────────────────` 0:00 / 0:00';
  const current = Math.max(0, Number(state.position || 0));
  const total = Number(state.current?.info?.length || 0);
  const ratio = total > 0 ? Math.min(1, current / total) : 0;
  const blocks = 18;
  const filled = Math.min(blocks - 1, Math.max(0, Math.round(ratio * blocks)));
  const bar = `${'━'.repeat(filled)}●${'─'.repeat(Math.max(0, blocks - filled - 1))}`;
  return `\`${bar}\` ${msToDuration(current)} / ${total > 0 ? msToDuration(total) : 'Live'}`;
}

async function play(guildId, options = {}) {
  const lavalink = await ensureManager();
  const query = String(options.query || '').trim();
  if (!query) return fail('Tell me what to play.', 'Use `play <song name or URL>`.', 'music_missing_query');

  const context = await resolveContext(guildId, options);
  if (context.error) return context.error;
  const voiceError = voiceChannelError(context.voiceChannel);
  if (voiceError) return voiceError;

  try {
    const settings = await getMusicSettings(guildId).catch(() => ({ stay247: false, autoplay: false, defaultVolume: envNumber('MUSIC_DEFAULT_VOLUME', 65) }));
    const state = lavalink.getPlayer(guildId);
    state.volume = Number(settings.defaultVolume || state.volume || envNumber('MUSIC_DEFAULT_VOLUME', 65));
    state.stay247 = Boolean(settings.stay247);
    state.autoplay = Boolean(settings.autoplay || state.autoplay);

    const result = await lavalink.loadTracks(query, guildId);
    if (!result.tracks.length) {
      return fail(
        'No playable music results found.',
        (result.failures || []).slice(0, 2).join('\n') || 'Try a more specific song name, YouTube/YouTube Music search, or a direct audio URL.',
        'music_no_results'
      );
    }

    const tracksToAdd = result.type === 'playlist' ? result.tracks : [result.tracks[0]];
    const added = await lavalink.add(guildId, tracksToAdd, options);
    const stateAfter = added.state;
    const mainTrack = added.started || tracksToAdd[0];

    if (result.type === 'playlist') {
      return ok([
        added.started ? 'playlist started' : 'playlist added',
        `**${escapeMarkdown(result.playlist?.name || 'Playlist')}**`,
        `${tracksToAdd.length} tracks`
      ].join('\n'), {
        thumbnail: toThumbnail(trackThumbnail(mainTrack)),
        footer: toFooter(compactFooter(stateAfter, [trackSource(mainTrack)])),
        queueData: queueDataFromState(stateAfter)
      });
    }

    return ok([added.started ? 'playing' : 'added', formatTrack(mainTrack)].join('\n'), {
      thumbnail: toThumbnail(trackThumbnail(mainTrack)),
      footer: toFooter(compactFooter(stateAfter, [trackDuration(mainTrack), trackSource(mainTrack)])),
      queueData: queueDataFromState(stateAfter)
    });
  } catch (error) {
    logger.warn({ error, guildId, query }, 'Lavalink play failed');
    return fail('I could not start Lavalink playback.', error.message || 'The selected source could not be played.', 'music_play_failed');
  }
}

async function search(guildId, options = {}) {
  const lavalink = await ensureManager();
  const query = String(options.query || '').trim();
  if (!query) return fail('Tell me what to search for.', 'Use `musicsearch <song name>`.', 'music_missing_query');
  const result = await lavalink.loadTracks(query, guildId);
  if (!result.tracks.length) return fail('No music results found.', 'Try a more specific song or artist.', 'music_no_results');
  const tracks = result.tracks.slice(0, 10);
  return panel(['search results', `**${escapeMarkdown(query)}**`].join('\n'), {
    thumbnail: toThumbnail(trackThumbnail(tracks[0])),
    fields: [{ name: INVISIBLE, value: fitLines(tracks.map(queueLine)), inline: false }],
    footer: toFooter(`Lavalink search · ${result.identifier || 'auto'}`)
  });
}

async function getState(guildId) {
  const lavalink = await ensureManager();
  const state = lavalink.getPlayer(guildId);
  if (!state.current) {
    return panel('Nothing is currently playing.', {
      footer: toFooter(`Lavalink · ${lavalink.ready ? 'connected' : 'connecting'} · ${lavalink.activeBaseUrl()}`),
      queueData: queueDataFromState(state)
    });
  }
  return panel([playbackState(state).toLowerCase(), formatTrack(state.current), progressLine(state)].join('\n'), {
    thumbnail: toThumbnail(trackThumbnail(state.current)),
    footer: toFooter(compactFooter(state, [trackSource(state.current)])),
    queueData: queueDataFromState(state)
  });
}

async function queuePayload(guildId) {
  const { state, error } = requireQueue(guildId);
  if (error) return error;
  const lines = state.queue.slice(0, 10).map(queueLine);
  return panel([formatTrack(state.current), '', lines.length ? fitLines(lines) : 'Nothing else queued.'].join('\n'), {
    thumbnail: toThumbnail(trackThumbnail(state.current)),
    footer: toFooter(compactFooter(state, [state.queue.length > 10 ? `Showing 10/${state.queue.length}` : null])),
    queueData: queueDataFromState(state)
  });
}

async function nowPlaying(guildId) {
  const { state, error } = requireQueue(guildId);
  if (error) return error;
  return panel(['now playing', formatTrack(state.current), progressLine(state)].join('\n'), {
    thumbnail: toThumbnail(trackThumbnail(state.current)),
    footer: toFooter(compactFooter(state, [trackDuration(state.current), trackSource(state.current)])),
    queueData: queueDataFromState(state)
  });
}

async function runQueueAction(guildId, action, onDone) {
  const { state, error } = requireQueue(guildId);
  if (error) return error;
  const result = await action(state);
  if (result?.ok === false) return result;
  if (result?.error) return result.error;
  const payload = onDone(state, result);
  if (payload?.ok) payload.queueData = queueDataFromState(state);
  return payload;
}

async function health() {
  const lavalink = manager;
  return {
    ok: Boolean(lavalink?.ready),
    backend: 'lavalink',
    ready: Boolean(lavalink?.ready),
    node: lavalink?.activeBaseUrl?.() || baseUrl(),
    sessionId: lavalink?.sessionId || null,
    players: lavalink?.players?.size || 0,
    playingPlayers: lavalink?.stats?.playingPlayers || 0,
    stats: lavalink?.stats ? {
      uptime: lavalink.stats.uptime,
      players: lavalink.stats.players,
      playingPlayers: lavalink.stats.playingPlayers,
      cpu: lavalink.stats.cpu
    } : null,
    searchPrefixes: String(process.env.MUSIC_LAVALINK_SEARCH_PREFIXES || DEFAULT_SEARCH_PREFIXES)
  };
}

async function runCommand(guildId, command, options = {}) {
  const lavalink = await ensureManager().catch(() => null);
  if (!lavalink) {
    return fail('Lavalink is not initialized.', 'Set MUSIC_BACKEND=lavalink, LAVALINK_URL, and LAVALINK_PASSWORD, then restart the bot.', 'music_not_initialized');
  }

  const normalized = String(command || '').toLowerCase();
  if (normalized === 'play') return play(guildId, options);
  if (normalized === 'search') return search(guildId, options);
  if (normalized === 'status') return getState(guildId);
  if (normalized === 'queue') return queuePayload(guildId);
  if (normalized === 'nowplaying' || normalized === 'np') return nowPlaying(guildId);

  if (normalized === 'pause') {
    return runQueueAction(guildId, async (state) => {
      await lavalink.updatePlayer(guildId, { paused: true });
      state.paused = true;
    }, (state) => panel(`paused\n${formatTrack(state.current, true)}`, { footer: toFooter(compactFooter(state)) }));
  }

  if (normalized === 'resume') {
    return runQueueAction(guildId, async (state) => {
      await lavalink.updatePlayer(guildId, { paused: false });
      state.paused = false;
      state.playing = true;
    }, (state) => ok(`resumed\n${formatTrack(state.current, true)}`, { footer: toFooter(compactFooter(state)) }));
  }

  if (normalized === 'skip') {
    return runQueueAction(guildId, async (state) => {
      const previous = state.current;
      const next = state.queue.shift();
      if (!next) {
        state.current = null;
        state.playing = false;
        await lavalink.updatePlayer(guildId, { track: { encoded: null } });
        return { previous, next: null };
      }
      await lavalink.playNow(guildId, next);
      return { previous, next };
    }, (state, result) => ok(result.next ? `skipped\n${formatTrack(result.next)}` : 'Skipped the current track. The queue is now empty.', {
      thumbnail: toThumbnail(trackThumbnail(result.next || result.previous)),
      footer: toFooter(compactFooter(state))
    }));
  }

  if (normalized === 'stop' || normalized === 'leave') {
    const state = lavalink.getPlayer(guildId);
    state.queue = [];
    state.current = null;
    state.playing = false;
    state.paused = false;
    await lavalink.destroyPlayer(guildId).catch(() => null);
    await lavalink.leaveVoice(guildId).catch(() => null);
    if (normalized === 'leave') state.voiceChannelId = null;
    return ok(normalized === 'leave' ? 'Disconnected and cleared the queue.' : 'Stopped playback and cleared the queue.', {
      queueData: queueDataFromState(state)
    });
  }

  if (normalized === 'clear') {
    return runQueueAction(guildId, async (state) => {
      state.queue = [];
    }, () => ok('Cleared the queued tracks.'));
  }

  if (normalized === 'shuffle') {
    return runQueueAction(guildId, async (state) => {
      for (let i = state.queue.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
      }
    }, (state) => ok(`Shuffled **${state.queue.length}** queued tracks.`, { footer: toFooter(compactFooter(state)) }));
  }

  if (normalized === 'remove') {
    const index = oneBasedIndex(options.index);
    if (index === null) return fail('Invalid queue number.', 'Use the number shown in `queue`.', 'music_invalid_index');
    return runQueueAction(guildId, async (state) => ({ removed: state.queue.splice(index, 1)[0] }), (state, result) => result.removed
      ? ok(`removed\n${formatTrack(result.removed, true)}`, { footer: toFooter(compactFooter(state)) })
      : fail('That queue entry does not exist.', 'Use the number shown in `queue`.', 'music_invalid_index'));
  }

  if (normalized === 'move') {
    const from = oneBasedIndex(options.from);
    const to = oneBasedIndex(options.to);
    if (from === null || to === null) return fail('Invalid queue number.', 'Use queue numbers like `move 2 5`.', 'music_invalid_index');
    return runQueueAction(guildId, async (state) => {
      if (from >= state.queue.length || to >= state.queue.length) return { moved: false };
      const [track] = state.queue.splice(from, 1);
      state.queue.splice(to, 0, track);
      return { moved: true, track };
    }, (state, result) => result.moved
      ? ok(`Moved track **${from + 1}** to **${to + 1}**.`, { footer: toFooter(compactFooter(state)) })
      : fail('That queue entry does not exist.', 'Use the number shown in `queue`.', 'music_invalid_index'));
  }

  if (normalized === 'skipto') {
    const index = oneBasedIndex(options.index);
    if (index === null) return fail('Invalid queue number.', 'Use the number shown in `queue`.', 'music_invalid_index');
    return runQueueAction(guildId, async (state) => {
      if (index >= state.queue.length) return { found: false };
      const [selected] = state.queue.splice(index, 1);
      await lavalink.playNow(guildId, selected);
      return { found: true, selected };
    }, (state, result) => result.found
      ? ok(`Skipped to track **${index + 1}**.\n${formatTrack(result.selected, true)}`, { footer: toFooter(compactFooter(state)) })
      : fail('That queue entry does not exist.', 'Use the number shown in `queue`.', 'music_invalid_index'));
  }

  if (normalized.startsWith('loop.')) {
    const mode = normalized.split('.')[1];
    if (!['off', 'track', 'queue'].includes(mode)) return fail('Invalid loop mode.', 'Use off, track, or queue.', 'music_invalid_loop');
    const state = lavalink.getPlayer(guildId);
    state.loopMode = mode;
    return panel(`Loop mode set to **${mode}**.`, { footer: toFooter(compactFooter(state)), queueData: queueDataFromState(state) });
  }

  if (normalized === 'volume' || normalized === 'settings.volume') {
    const raw = Number.parseInt(String(options.value || ''), 10);
    const value = Math.max(0, Math.min(200, Number.isFinite(raw) ? raw : envNumber('MUSIC_DEFAULT_VOLUME', 65)));
    const state = lavalink.getPlayer(guildId);
    state.volume = value;
    await saveMusicSettings(guildId, { defaultVolume: value }).catch(() => null);
    if (state.current) await lavalink.updatePlayer(guildId, { volume: value }).catch(() => null);
    return ok(`Volume set to **${value}%**.`, { footer: toFooter(compactFooter(state)), queueData: queueDataFromState(state) });
  }

  if (normalized === 'seek') {
    const position = parseDuration(options.position) ?? Number(options.position || 0);
    if (!Number.isFinite(position) || position < 0) return fail('Invalid seek position.', 'Try `seek 1:20`, `seek 80`, or `seek 2m`.', 'music_invalid_seek');
    return runQueueAction(guildId, async (state) => {
      await lavalink.updatePlayer(guildId, { position: Math.floor(position) });
      state.position = Math.floor(position);
    }, (state) => ok(`Seeked to **${msToDuration(position)}**.`, { footer: toFooter(compactFooter(state)) }));
  }

  if (normalized === 'autoplay' || normalized === 'settings.autoplay') {
    const enabled = boolFromOnOff(options.enabled, true);
    const state = lavalink.getPlayer(guildId);
    state.autoplay = enabled;
    await saveMusicSettings(guildId, { autoplay: enabled }).catch(() => null);
    return panel(`Autoplay is now **${enabled ? 'on' : 'off'}**.`, { footer: toFooter(compactFooter(state)), queueData: queueDataFromState(state) });
  }

  if (normalized === '247') {
    const enabled = boolFromOnOff(options.enabled || options.value, true);
    const state = lavalink.getPlayer(guildId);
    state.stay247 = enabled;
    await saveMusicSettings(guildId, { stay247: enabled }).catch(() => null);
    return panel(`24/7 mode is now **${enabled ? 'on' : 'off'}**.`, { footer: toFooter(compactFooter(state)), queueData: queueDataFromState(state) });
  }

  if (normalized.startsWith('filter.')) {
    if (envFlag('MUSIC_LAVALINK_DISABLE_FILTERS', false)) {
      return fail('Audio filters are disabled.', 'Set MUSIC_LAVALINK_DISABLE_FILTERS=false to enable Lavalink filters.', 'music_filters_disabled');
    }
    const mode = normalized.split('.').slice(1).join('.') || options.mode || 'off';
    const filters = filterPayload(mode);
    if (filters === null) return fail('Unknown audio filter.', 'Try bassboost, nightcore, vaporwave, karaoke, tremolo, vibrato, rotation, lowpass, or off.', 'music_unknown_filter');
    return runQueueAction(guildId, async (state) => {
      await lavalink.updatePlayer(guildId, { filters });
      state.filters = Object.keys(filters).length ? mode : 'off';
    }, (state) => panel(Object.keys(filters).length ? `Applied **${escapeMarkdown(mode)}**.` : 'Audio filters are now off.', { footer: toFooter(compactFooter(state, [`Filters ${state.filters}`])) }));
  }

  if (normalized === 'stats') {
    const h = await health();
    return panel('Lavalink music backend is running.', {
      footer: toFooter([
        h.ready ? 'connected' : 'connecting',
        h.node,
        `${h.players} local players`,
        h.stats ? `${h.stats.playingPlayers}/${h.stats.players} node players` : null
      ].filter(Boolean).join(' · '))
    });
  }

  if (normalized === 'history') {
    const state = lavalink.getPlayer(guildId);
    const lines = state.history.slice(0, 10).map((track, index) => `\`${index + 1}\` ${formatTrack(track, true)}`);
    return panel(lines.length ? fitLines(lines) : 'No recent tracks.', { footer: toFooter(compactFooter(state)), queueData: queueDataFromState(state) });
  }

  if (normalized === 'lyrics') return panel('Lyrics lookup is not enabled in this Lavalink backend.');

  if (normalized === 'settings.search') {
    const prefixes = String(options.engine || options.value || '').trim();
    if (!prefixes) return fail('Invalid search setting.', 'Use values like `ytsearch:,ytmsearch:`.', 'music_invalid_search_engine');
    await saveMusicSettings(guildId, { searchEngine: prefixes }).catch(() => null);
    return panel(`Lavalink search prefixes set to **${escapeMarkdown(prefixes)}**.`);
  }

  if (normalized === 'settings.announce') return panel('Track announcements are not needed for the Lavalink backend yet.');
  if (normalized === 'settings.djrole') return panel('DJ role restrictions are not enforced by the Lavalink backend yet.');
  if (normalized === 'settings.idle') return panel('Idle timeout is controlled with `MUSIC_IDLE_DESTROY_MS` in your env.');
  if (normalized === 'settings.restrict') return panel('Music restrictions are not enforced by the Lavalink backend yet.');

  if (normalized === 'settings' || normalized.startsWith('settings.')) {
    const settings = await getMusicSettings(guildId).catch(() => null);
    const state = lavalink.getPlayer(guildId);
    return panel([
      'settings',
      `24/7: **${state.stay247 || settings?.stay247 ? 'on' : 'off'}**`,
      `Autoplay: **${state.autoplay || settings?.autoplay ? 'on' : 'off'}**`,
      `Default volume: **${settings?.defaultVolume || envNumber('MUSIC_DEFAULT_VOLUME', 65)}%**`,
      `Search prefixes: **${escapeMarkdown(settings?.searchEngine || process.env.MUSIC_LAVALINK_SEARCH_PREFIXES || DEFAULT_SEARCH_PREFIXES)}**`,
      `Filters: **${envFlag('MUSIC_LAVALINK_DISABLE_FILTERS', false) ? 'disabled' : 'enabled'}**`
    ].join('\n'));
  }

  if (normalized === 'node.failover') {
    lavalink.rotateNode();
    lavalink.ready = false;
    try { lavalink.ws?.close(); } catch { /* ignore */ }
    lavalink.connect().catch(() => null);
    return panel(`Failing over to **${escapeMarkdown(lavalink.activeBaseUrl())}**.`);
  }

  if (['panel', 'export', 'import'].includes(normalized)) return getState(guildId);

  return fail('Unknown music command.', `The Lavalink backend does not recognize \`${command}\`.`, 'music_unknown_command');
}

async function handleMusicInteraction() {
  return false;
}

module.exports = {
  getState,
  handleMusicInteraction,
  health,
  initializeMusicPlayer,
  isLavalinkEnabled,
  isNodeMusicEnabled: isLavalinkEnabled,
  runCommand
};