const {
  normalizeName,
  hasDefaultAvatar,
  hoursSince,
  scoreJoinWave
} = require('./riskScorer');

const joinBuckets = new Map();
const inviteBuckets = new Map();

const CLEANUP_INTERVAL_MS = 60_000;
const MAX_AGE_MS = 60 * 60 * 1000;

let lastCleanup = 0;

function now() {
  return Date.now();
}

function cleanup() {
  const current = now();

  if (current - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = current;

  for (const [guildId, events] of joinBuckets.entries()) {
    const recent = events.filter((event) => current - event.at <= MAX_AGE_MS);

    if (recent.length) joinBuckets.set(guildId, recent);
    else joinBuckets.delete(guildId);
  }

  for (const [key, events] of inviteBuckets.entries()) {
    const recent = events.filter((event) => current - event.at <= MAX_AGE_MS);

    if (recent.length) inviteBuckets.set(key, recent);
    else inviteBuckets.delete(key);
  }
}

function inviteKey(guildId, inviteCode) {
  return `${guildId}:${inviteCode || 'unknown'}`;
}

function getGuildEvents(guildId) {
  cleanup();
  return joinBuckets.get(guildId) || [];
}

function getEventsWithin(guildId, windowSeconds) {
  const current = now();
  const cutoff = current - Number(windowSeconds || 60) * 1000;

  return getGuildEvents(guildId).filter((event) => event.at >= cutoff);
}

function getInviteEvents(guildId, inviteCode, windowSeconds) {
  const current = now();
  const cutoff = current - Number(windowSeconds || 60) * 1000;
  const key = inviteKey(guildId, inviteCode);

  return (inviteBuckets.get(key) || []).filter((event) => event.at >= cutoff);
}

function countBy(items, getKey) {
  const map = new Map();

  for (const item of items) {
    const key = getKey(item);
    map.set(key, (map.get(key) || 0) + 1);
  }

  return map;
}

function maxValue(map) {
  return Math.max(0, ...map.values());
}

function similarNameCount(events, member) {
  const target = normalizeName(member.displayName || member.user?.username || '');
  if (!target) return 0;

  let count = 0;

  for (const event of events) {
    const candidate = normalizeName(event.displayName || event.username || '');
    if (!candidate) continue;

    if (candidate === target) {
      count += 1;
      continue;
    }

    if (target.length >= 4 && candidate.includes(target.slice(0, 4))) {
      count += 1;
      continue;
    }

    if (candidate.length >= 4 && target.includes(candidate.slice(0, 4))) {
      count += 1;
    }
  }

  return count;
}

function buildStats(events, config = {}) {
  const totalJoins = events.length;
  const botJoins = events.filter((event) => event.bot).length;
  const freshJoins = events.filter((event) => event.freshAccount).length;
  const noAvatarJoins = events.filter((event) => event.noAvatar).length;

  const inviteCounts = countBy(events, (event) => event.inviteCode || 'unknown');
  const duplicateNameCounts = countBy(events, (event) => event.normalizedName || 'unknown');

  const maxInviteJoins = maxValue(inviteCounts);
  const maxDuplicateNameCount = maxValue(duplicateNameCounts);

  let maxSimilarNameCount = 0;

  for (const event of events) {
    if (event.normalizedName === 'unknown') continue;

    const similar = events.filter((item) => {
      if (!item.normalizedName || item.normalizedName === 'unknown') return false;
      if (item.normalizedName === event.normalizedName) return true;
      return item.normalizedName.startsWith(event.normalizedName.slice(0, 4)) ||
        event.normalizedName.startsWith(item.normalizedName.slice(0, 4));
    }).length;

    maxSimilarNameCount = Math.max(maxSimilarNameCount, similar);
  }

  const stats = {
    totalJoins,
    botJoins,
    freshJoins,
    noAvatarJoins,

    botRatio: totalJoins ? botJoins / totalJoins : 0,
    freshAccountRatio: totalJoins ? freshJoins / totalJoins : 0,
    noAvatarRatio: totalJoins ? noAvatarJoins / totalJoins : 0,

    maxInviteJoins,
    maxDuplicateNameCount,
    maxSimilarNameCount,

    inviteCounts: Object.fromEntries(inviteCounts),
    duplicateNameCounts: Object.fromEntries(duplicateNameCounts)
  };

  return {
    ...stats,
    waveRisk: scoreJoinWave(stats, config)
  };
}

function recordJoin(member, options = {}) {
  cleanup();

  const {
    config = {},
    inviteCode = null,
    memberRisk = null,
    previousFlags = []
  } = options;

  const guildId = member.guild.id;
  const accountAgeHours = hoursSince(member.user?.createdTimestamp);
  const freshThreshold = Number(config.join?.accountAgeHours || 24);

  const event = {
    at: now(),

    guildId,
    userId: member.id,

    username: member.user?.username || null,
    displayName: member.displayName || member.user?.globalName || member.user?.username || null,
    normalizedName: normalizeName(member.displayName || member.user?.username || ''),

    bot: member.user?.bot === true,
    noAvatar: hasDefaultAvatar(member.user),

    accountAgeHours,
    freshAccount: accountAgeHours !== null && accountAgeHours <= freshThreshold,

    inviteCode,

    memberRisk,
    previousFlags
  };

  const guildEvents = joinBuckets.get(guildId) || [];
  guildEvents.push(event);
  joinBuckets.set(guildId, guildEvents);

  const iKey = inviteKey(guildId, inviteCode);
  const inviteEvents = inviteBuckets.get(iKey) || [];
  inviteEvents.push(event);
  inviteBuckets.set(iKey, inviteEvents);

  const windowEvents = getEventsWithin(guildId, config.join?.windowSeconds || 20);
  const stats = buildStats(windowEvents, config);

  const inviteWindowEvents = getInviteEvents(
    guildId,
    inviteCode,
    config.invite?.windowSeconds || 60
  );

  const duplicateNameMap = countBy(windowEvents, (item) => item.normalizedName || 'unknown');
  const duplicateNameCount = duplicateNameMap.get(event.normalizedName) || 0;

  return {
    event,
    events: windowEvents,
    stats,

    inviteBurst: {
      code: inviteCode,
      count: inviteWindowEvents.length,
      events: inviteWindowEvents
    },

    duplicateNameCount,
    similarNameCount: similarNameCount(windowEvents, member),

    triggered: {
      joinVelocity: windowEvents.length >= Number(config.join?.limit || 8),
      botRaid: stats.botJoins >= Number(config.botRaid?.limit || 3),
      inviteBurst: inviteWindowEvents.length >= Number(config.invite?.singleInviteJoinLimit || 8),
      waveRisk: stats.waveRisk.score >= Number(config.join?.waveRiskThreshold || 70)
    }
  };
}

function getJoinStats(guildId, config = {}) {
  const events = getEventsWithin(guildId, config.join?.windowSeconds || 20);
  return buildStats(events, config);
}

function resetGuildJoins(guildId) {
  joinBuckets.delete(guildId);

  for (const key of inviteBuckets.keys()) {
    if (key.startsWith(`${guildId}:`)) {
      inviteBuckets.delete(key);
    }
  }
}

module.exports = {
  recordJoin,
  getJoinStats,
  getEventsWithin,
  getInviteEvents,
  resetGuildJoins
};