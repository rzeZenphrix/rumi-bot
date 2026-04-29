const db = require('../../services/database');
const logger = require('../logging/logger');

const ANALYTICS_NAMESPACE = 'analytics:guild';
const CACHE_TTL_MS = 60_000;
const FLUSH_DELAY_MS = 5_000;

const guildCache = new Map();
const flushTimers = new Map();
const voiceSessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function defaultStats(guildId) {
  return {
    guildId,
    messageCount: 0,
    voiceJoinCount: 0,
    voiceSecondsTotal: 0,
    voiceSessionCount: 0,
    lastMessageAt: null,
    lastVoiceAt: null,
    updatedAt: nowIso(),
  };
}

async function loadGuildStats(guildId) {
  const cached = guildCache.get(guildId);
  if (cached && (Date.now() - cached.loadedAt) < CACHE_TTL_MS) {
    return cached.value;
  }

  const stored = await db.getKv(ANALYTICS_NAMESPACE, guildId, null);
  const value = { ...defaultStats(guildId), ...(stored || {}), guildId };
  guildCache.set(guildId, { value, loadedAt: Date.now() });
  return value;
}

async function flushGuildStats(guildId) {
  flushTimers.delete(guildId);
  const cached = guildCache.get(guildId);
  if (!cached?.value) return;

  cached.value.updatedAt = nowIso();

  try {
    await db.setKv(ANALYTICS_NAMESPACE, guildId, cached.value);
    cached.loadedAt = Date.now();
  } catch (error) {
    logger.warn(
      { guildId, error },
      'Failed to persist server analytics snapshot'
    );
  }
}

function scheduleFlush(guildId) {
  if (flushTimers.has(guildId)) return;
  flushTimers.set(
    guildId,
    setTimeout(() => {
      flushGuildStats(guildId).catch(() => null);
    }, FLUSH_DELAY_MS)
  );
}

async function recordMessage(guildId) {
  if (!guildId) return null;
  const stats = await loadGuildStats(guildId);
  stats.messageCount += 1;
  stats.lastMessageAt = nowIso();
  scheduleFlush(guildId);
  return stats;
}

async function beginVoiceSession(guildId, userId) {
  if (!guildId || !userId) return;
  const key = `${guildId}:${userId}`;
  if (voiceSessions.has(key)) return;

  const stats = await loadGuildStats(guildId);
  stats.voiceJoinCount += 1;
  stats.lastVoiceAt = nowIso();
  voiceSessions.set(key, Date.now());
  scheduleFlush(guildId);
}

async function endVoiceSession(guildId, userId) {
  if (!guildId || !userId) return;
  const key = `${guildId}:${userId}`;
  const startedAt = voiceSessions.get(key);
  if (!startedAt) return;

  voiceSessions.delete(key);
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const stats = await loadGuildStats(guildId);
  stats.voiceSecondsTotal += elapsedSeconds;
  stats.voiceSessionCount += 1;
  stats.lastVoiceAt = nowIso();
  scheduleFlush(guildId);
}

async function handleVoiceStateTransition(oldState, newState) {
  const guildId = newState.guild?.id || oldState.guild?.id;
  const userId = newState.member?.id || oldState.member?.id;
  if (!guildId || !userId) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  if (!oldChannelId && newChannelId) {
    await beginVoiceSession(guildId, userId);
    return;
  }

  if (oldChannelId && !newChannelId) {
    await endVoiceSession(guildId, userId);
    return;
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    const key = `${guildId}:${userId}`;
    if (!voiceSessions.has(key)) {
      voiceSessions.set(key, Date.now());
    }
    const stats = await loadGuildStats(guildId);
    stats.lastVoiceAt = nowIso();
    scheduleFlush(guildId);
  }
}

async function getGuildAnalytics(guildId) {
  return loadGuildStats(guildId);
}

module.exports = {
  recordMessage,
  handleVoiceStateTransition,
  getGuildAnalytics,
};
