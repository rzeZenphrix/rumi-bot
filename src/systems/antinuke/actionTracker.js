const buckets = new Map();
const punished = new Map();

const CLEANUP_INTERVAL_MS = 60_000;
const PUNISH_TTL_MS = 60_000;
const MAX_BUCKET_AGE_MS = 60 * 60 * 1000;

let lastCleanup = 0;

function now() {
  return Date.now();
}

function bucketKey(guildId, executorId, actionType) {
  return `${guildId}:${executorId}:${actionType}`;
}

function punishmentKey(guildId, executorId) {
  return `${guildId}:${executorId}`;
}

function cleanup() {
  const current = now();

  if (current - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = current;

  for (const [key, bucket] of buckets.entries()) {
    const newest = bucket.events.at(-1)?.at || 0;

    if (current - newest > MAX_BUCKET_AGE_MS) {
      buckets.delete(key);
    }
  }

  for (const [key, timestamp] of punished.entries()) {
    if (current - timestamp > PUNISH_TTL_MS) {
      punished.delete(key);
    }
  }
}

function getRecentEvents(guildId, executorId, windowSeconds) {
  const current = now();
  const cutoff = current - windowSeconds * 1000;
  const output = [];

  for (const [key, bucket] of buckets.entries()) {
    if (!key.startsWith(`${guildId}:${executorId}:`)) continue;

    for (const event of bucket.events) {
      if (event.at >= cutoff) output.push(event);
    }
  }

  return output.sort((a, b) => a.at - b.at);
}

function markPunished(guildId, executorId) {
  punished.set(punishmentKey(guildId, executorId), now());
}

function wasRecentlyPunished(guildId, executorId) {
  const key = punishmentKey(guildId, executorId);
  const timestamp = punished.get(key);

  if (!timestamp) return false;

  if (now() - timestamp > PUNISH_TTL_MS) {
    punished.delete(key);
    return false;
  }

  return true;
}

function uniqueEvents(events = []) {
  const seen = new Set();
  const output = [];

  for (const event of events) {
    const key = [
      event.guildId,
      event.executorId,
      event.actionType,
      event.targetId || '',
      event.at
    ].join(':');

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(event);
  }

  return output;
}

function recordAction(options) {
  cleanup();

  const {
    guildId,
    executorId,
    actionType,
    targetId = null,
    weight = 1,
    limit = 1,
    windowSeconds = 30,
    combinedScoreConfig = null,

    target = null,
    oldValue = null,
    newValue = null,
    metadata = {}
  } = options;

  const current = now();
  const key = bucketKey(guildId, executorId, actionType);
  const cutoff = current - windowSeconds * 1000;

  const bucket = buckets.get(key) || {
    events: []
  };

  bucket.events = bucket.events.filter((event) => event.at >= cutoff);

  const event = {
    at: current,
    guildId,
    executorId,
    actionType,
    targetId,
    weight,

    /**
     * These are intentionally kept in memory only.
     * They allow rollback of previous destructive actions once the threshold is crossed.
     */
    target,
    oldValue,
    newValue,
    metadata
  };

  bucket.events.push(event);
  buckets.set(key, bucket);

  const actionCount = bucket.events.length;
  const actionScore = bucket.events.reduce((total, item) => total + Number(item.weight || 0), 0);

  let combinedEvents = [];
  let combinedScore = 0;
  let combinedTriggered = false;

  if (combinedScoreConfig?.enabled) {
    combinedEvents = getRecentEvents(
      guildId,
      executorId,
      combinedScoreConfig.windowSeconds || windowSeconds
    );

    combinedScore = combinedEvents.reduce((total, item) => total + Number(item.weight || 0), 0);
    combinedTriggered = combinedScore >= Number(combinedScoreConfig.limit || 999999);
  }

  const actionTriggered = actionCount >= Number(limit || 1);

  return {
    triggered: actionTriggered || combinedTriggered,
    actionTriggered,
    combinedTriggered,

    actionCount,
    actionScore,

    combinedScore,

    events: uniqueEvents(bucket.events),
    combinedEvents: uniqueEvents(combinedEvents),

    recentlyPunished: wasRecentlyPunished(guildId, executorId)
  };
}

function resetGuild(guildId) {
  for (const key of buckets.keys()) {
    if (key.startsWith(`${guildId}:`)) buckets.delete(key);
  }

  for (const key of punished.keys()) {
    if (key.startsWith(`${guildId}:`)) punished.delete(key);
  }
}

module.exports = {
  recordAction,
  markPunished,
  wasRecentlyPunished,
  resetGuild
};