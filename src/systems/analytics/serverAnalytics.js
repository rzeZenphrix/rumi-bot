const db = require('../../services/database');
const logger = require('../logging/logger');

const ANALYTICS_NAMESPACE = 'analytics:guild';
const ANALYTICS_DAILY_NAMESPACE = 'analytics:guild:daily';
const ANALYTICS_CHANNEL_NAMESPACE = 'analytics:guild:channels';
const ANALYTICS_MEMBER_NAMESPACE = 'analytics:guild:members';
const CACHE_TTL_MS = 60_000;
const FLUSH_DELAY_MS = 5_000;
const MEMBER_CACHE_LIMIT = 150;
const CHANNEL_CACHE_LIMIT = 75;

const guildCache = new Map();
const dailyCache = new Map();
const channelCache = new Map();
const memberCache = new Map();
const flushTimers = new Map();
const voiceSessions = new Map();

function nowIso() {
  return new Date().toISOString();
}

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function defaultStats(guildId) {
  return {
    guildId,
    messageCount: 0,
    joinCount: 0,
    leaveCount: 0,
    voiceJoinCount: 0,
    voiceSecondsTotal: 0,
    voiceSessionCount: 0,
    lastMessageAt: null,
    lastVoiceAt: null,
    lastJoinAt: null,
    lastLeaveAt: null,
    updatedAt: nowIso()
  };
}

function defaultDailyEntry() {
  return {
    messageCount: 0,
    joinCount: 0,
    leaveCount: 0,
    voiceJoinCount: 0,
    voiceSecondsTotal: 0,
    voiceSessionCount: 0
  };
}

function defaultChannelEntry(channelId) {
  return {
    channelId,
    messageCount: 0,
    lastMessageAt: null,
    voiceSecondsTotal: 0,
    voiceSessionCount: 0,
    lastVoiceAt: null
  };
}

function defaultMemberEntry(userId) {
  return {
    userId,
    messageCount: 0,
    voiceSecondsTotal: 0,
    voiceSessionCount: 0,
    lastMessageAt: null,
    lastVoiceAt: null
  };
}

function loadFromCache(map, key) {
  const cached = map.get(key);
  if (cached && (Date.now() - cached.loadedAt) < CACHE_TTL_MS) {
    return cached.value;
  }
  return null;
}

function setCache(map, key, value) {
  map.set(key, { value, loadedAt: Date.now() });
  return value;
}

async function loadGuildStats(guildId) {
  const cached = loadFromCache(guildCache, guildId);
  if (cached) return cached;

  const stored = await db.getKv(ANALYTICS_NAMESPACE, guildId, null);
  return setCache(guildCache, guildId, { ...defaultStats(guildId), ...(stored || {}), guildId });
}

async function loadDailyStats(guildId) {
  const cached = loadFromCache(dailyCache, guildId);
  if (cached) return cached;

  const stored = await db.getKv(ANALYTICS_DAILY_NAMESPACE, guildId, {});
  return setCache(dailyCache, guildId, stored || {});
}

async function loadChannelStats(guildId) {
  const cached = loadFromCache(channelCache, guildId);
  if (cached) return cached;

  const stored = await db.getKv(ANALYTICS_CHANNEL_NAMESPACE, guildId, {});
  return setCache(channelCache, guildId, stored || {});
}

async function loadMemberStats(guildId) {
  const cached = loadFromCache(memberCache, guildId);
  if (cached) return cached;

  const stored = await db.getKv(ANALYTICS_MEMBER_NAMESPACE, guildId, {});
  return setCache(memberCache, guildId, stored || {});
}

function trimObjectByScore(source = {}, limit, scorer) {
  const entries = Object.values(source || {});
  if (entries.length <= limit) return source;

  const kept = entries
    .sort((left, right) => scorer(right) - scorer(left))
    .slice(0, limit);

  return kept.reduce((map, entry) => {
    map[entry.userId || entry.channelId] = entry;
    return map;
  }, {});
}

function ensureDailyEntry(dailyMap, key) {
  dailyMap[key] ||= defaultDailyEntry();
  return dailyMap[key];
}

async function flushGuildStats(guildId) {
  flushTimers.delete(guildId);

  const stats = guildCache.get(guildId)?.value;
  const daily = dailyCache.get(guildId)?.value;
  const channels = channelCache.get(guildId)?.value;
  const members = memberCache.get(guildId)?.value;

  if (!stats) return;

  stats.updatedAt = nowIso();

  try {
    await db.setKv(ANALYTICS_NAMESPACE, guildId, stats);

    if (daily) {
      const sortedKeys = Object.keys(daily).sort();
      const latest = sortedKeys.slice(-14).reduce((map, key) => {
        map[key] = daily[key];
        return map;
      }, {});
      await db.setKv(ANALYTICS_DAILY_NAMESPACE, guildId, latest);
      setCache(dailyCache, guildId, latest);
    }

    if (channels) {
      const trimmedChannels = trimObjectByScore(
        channels,
        CHANNEL_CACHE_LIMIT,
        (entry) => Number(entry.messageCount || 0) + Number(entry.voiceSecondsTotal || 0) / 60
      );
      await db.setKv(ANALYTICS_CHANNEL_NAMESPACE, guildId, trimmedChannels);
      setCache(channelCache, guildId, trimmedChannels);
    }

    if (members) {
      const trimmedMembers = trimObjectByScore(
        members,
        MEMBER_CACHE_LIMIT,
        (entry) => Number(entry.messageCount || 0) + Number(entry.voiceSecondsTotal || 0) / 60
      );
      await db.setKv(ANALYTICS_MEMBER_NAMESPACE, guildId, trimmedMembers);
      setCache(memberCache, guildId, trimmedMembers);
    }

    setCache(guildCache, guildId, stats);
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

async function recordMessage(guildId, channelId = null, userId = null) {
  if (!guildId) return null;

  const [stats, dailyMap, channels, members] = await Promise.all([
    loadGuildStats(guildId),
    loadDailyStats(guildId),
    loadChannelStats(guildId),
    loadMemberStats(guildId)
  ]);

  const now = nowIso();
  stats.messageCount += 1;
  stats.lastMessageAt = now;

  const today = ensureDailyEntry(dailyMap, dateKey());
  today.messageCount += 1;

  if (channelId) {
    channels[channelId] = {
      ...defaultChannelEntry(channelId),
      ...(channels[channelId] || {}),
      channelId,
      messageCount: Number(channels[channelId]?.messageCount || 0) + 1,
      lastMessageAt: now
    };
  }

  if (userId) {
    members[userId] = {
      ...defaultMemberEntry(userId),
      ...(members[userId] || {}),
      userId,
      messageCount: Number(members[userId]?.messageCount || 0) + 1,
      lastMessageAt: now
    };
  }

  scheduleFlush(guildId);
  return stats;
}

async function recordJoin(guildId) {
  if (!guildId) return null;
  const [stats, dailyMap] = await Promise.all([loadGuildStats(guildId), loadDailyStats(guildId)]);
  const now = nowIso();
  stats.joinCount += 1;
  stats.lastJoinAt = now;
  ensureDailyEntry(dailyMap, dateKey()).joinCount += 1;
  scheduleFlush(guildId);
  return stats;
}

async function recordLeave(guildId) {
  if (!guildId) return null;
  const [stats, dailyMap] = await Promise.all([loadGuildStats(guildId), loadDailyStats(guildId)]);
  const now = nowIso();
  stats.leaveCount += 1;
  stats.lastLeaveAt = now;
  ensureDailyEntry(dailyMap, dateKey()).leaveCount += 1;
  scheduleFlush(guildId);
  return stats;
}

async function beginVoiceSession(guildId, userId, channelId = null, options = {}) {
  if (!guildId || !userId) return;
  const key = `${guildId}:${userId}`;
  if (voiceSessions.has(key)) return;

  const countJoin = options.countJoin !== false;

  const [stats, dailyMap, members, channels] = await Promise.all([
    loadGuildStats(guildId),
    loadDailyStats(guildId),
    loadMemberStats(guildId),
    loadChannelStats(guildId)
  ]);
  const now = nowIso();

  if (countJoin) {
    stats.voiceJoinCount += 1;
    ensureDailyEntry(dailyMap, dateKey()).voiceJoinCount += 1;
  }
  stats.lastVoiceAt = now;
  members[userId] = {
    ...defaultMemberEntry(userId),
    ...(members[userId] || {}),
    userId,
    lastVoiceAt: now
  };

  if (channelId) {
    channels[channelId] = {
      ...defaultChannelEntry(channelId),
      ...(channels[channelId] || {}),
      channelId,
      lastVoiceAt: now
    };
  }

  voiceSessions.set(key, {
    startedAt: Date.now(),
    channelId
  });
  scheduleFlush(guildId);
}

async function endVoiceSession(guildId, userId, channelIdOverride = null) {
  if (!guildId || !userId) return;
  const key = `${guildId}:${userId}`;
  const session = voiceSessions.get(key);
  if (!session) return;

  voiceSessions.delete(key);
  const startedAt = Number(session.startedAt || 0);
  const channelId = channelIdOverride || session.channelId || null;
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const [stats, dailyMap, members, channels] = await Promise.all([
    loadGuildStats(guildId),
    loadDailyStats(guildId),
    loadMemberStats(guildId),
    loadChannelStats(guildId)
  ]);
  const now = nowIso();

  stats.voiceSecondsTotal += elapsedSeconds;
  stats.voiceSessionCount += 1;
  stats.lastVoiceAt = now;

  const today = ensureDailyEntry(dailyMap, dateKey());
  today.voiceSecondsTotal += elapsedSeconds;
  today.voiceSessionCount += 1;

  members[userId] = {
    ...defaultMemberEntry(userId),
    ...(members[userId] || {}),
    userId,
    voiceSecondsTotal: Number(members[userId]?.voiceSecondsTotal || 0) + elapsedSeconds,
    voiceSessionCount: Number(members[userId]?.voiceSessionCount || 0) + 1,
    lastVoiceAt: now
  };

  if (channelId) {
    channels[channelId] = {
      ...defaultChannelEntry(channelId),
      ...(channels[channelId] || {}),
      channelId,
      voiceSecondsTotal: Number(channels[channelId]?.voiceSecondsTotal || 0) + elapsedSeconds,
      voiceSessionCount: Number(channels[channelId]?.voiceSessionCount || 0) + 1,
      lastVoiceAt: now
    };
  }

  scheduleFlush(guildId);
}

async function handleVoiceStateTransition(oldState, newState) {
  const guildId = newState.guild?.id || oldState.guild?.id;
  const userId = newState.member?.id || oldState.member?.id;
  if (!guildId || !userId) return;

  const oldChannelId = oldState.channelId;
  const newChannelId = newState.channelId;

  if (!oldChannelId && newChannelId) {
    await beginVoiceSession(guildId, userId, newChannelId, { countJoin: true });
    return;
  }

  if (oldChannelId && !newChannelId) {
    await endVoiceSession(guildId, userId, oldChannelId);
    return;
  }

  if (oldChannelId && newChannelId && oldChannelId !== newChannelId) {
    await endVoiceSession(guildId, userId, oldChannelId);
    await beginVoiceSession(guildId, userId, newChannelId, { countJoin: false });
  }
}

function pickDateRange(days, offset = 0) {
  const keys = [];
  const today = new Date();
  for (let index = offset; index < offset + days; index += 1) {
    const entry = new Date(today);
    entry.setUTCDate(entry.getUTCDate() - index);
    keys.push(dateKey(entry));
  }
  return keys;
}

async function getGuildAnalytics(guildId) {
  return loadGuildStats(guildId);
}

async function getGuildAnalyticsRollup(guildId) {
  const [lifetime, daily, channels, members] = await Promise.all([
    loadGuildStats(guildId),
    loadDailyStats(guildId),
    loadChannelStats(guildId),
    loadMemberStats(guildId)
  ]);

  const todayKeys = pickDateRange(1);
  const weekKeys = pickDateRange(7);
  const previousWeekKeys = pickDateRange(7, 7);
  const monthKeys = pickDateRange(30);

  const today = keysToWindow(daily, todayKeys);
  const week = keysToWindow(daily, weekKeys);
  const previousWeek = keysToWindow(daily, previousWeekKeys);
  const month = keysToWindow(daily, monthKeys);

  return {
    lifetime,
    today,
    week,
    previousWeek,
    month,
    channels: Object.values(channels).sort((left, right) => {
      const leftScore = Number(left.messageCount || 0) + Number(left.voiceSecondsTotal || 0) / 60;
      const rightScore = Number(right.messageCount || 0) + Number(right.voiceSecondsTotal || 0) / 60;
      return rightScore - leftScore;
    }),
    members: Object.values(members).sort((left, right) => {
      const leftScore = Number(left.messageCount || 0) + Number(left.voiceSecondsTotal || 0) / 60;
      const rightScore = Number(right.messageCount || 0) + Number(right.voiceSecondsTotal || 0) / 60;
      return rightScore - leftScore;
    })
  };
}

async function getGuildMemberActivity(guildId, userId) {
  if (!guildId || !userId) return null;
  const members = await loadMemberStats(guildId);
  return members[userId] || defaultMemberEntry(userId);
}

async function getGuildChannelActivity(guildId, channelId) {
  if (!guildId || !channelId) return null;
  const channels = await loadChannelStats(guildId);
  return channels[channelId] || defaultChannelEntry(channelId);
}

function getActiveVoiceSessionsForGuild(guildId) {
  const rows = [];
  for (const [key, session] of voiceSessions.entries()) {
    const [sessionGuildId, userId] = key.split(':');
    if (sessionGuildId !== guildId) continue;
    rows.push({
      userId,
      channelId: session.channelId || null,
      startedAt: session.startedAt,
      activeSeconds: Math.max(0, Math.floor((Date.now() - Number(session.startedAt || Date.now())) / 1000))
    });
  }
  return rows.sort((left, right) => right.activeSeconds - left.activeSeconds);
}

function keysToWindow(daily, keys) {
  return keys.reduce((window, key) => {
    const entry = daily[key] || {};
    window.messageCount += Number(entry.messageCount || 0);
    window.joinCount += Number(entry.joinCount || 0);
    window.leaveCount += Number(entry.leaveCount || 0);
    window.voiceJoinCount += Number(entry.voiceJoinCount || 0);
    window.voiceSecondsTotal += Number(entry.voiceSecondsTotal || 0);
    window.voiceSessionCount += Number(entry.voiceSessionCount || 0);
    return window;
  }, defaultDailyEntry());
}

module.exports = {
  recordMessage,
  recordJoin,
  recordLeave,
  handleVoiceStateTransition,
  getGuildAnalytics,
  getGuildAnalyticsRollup,
  getGuildMemberActivity,
  getGuildChannelActivity,
  getActiveVoiceSessionsForGuild
};
