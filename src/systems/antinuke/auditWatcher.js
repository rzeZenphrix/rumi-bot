const logger = require('../logging/logger');

const seenAuditEntries = new Map();
const SEEN_TTL_MS = 5 * 60 * 1000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanupSeen() {
  const now = Date.now();

  for (const [key, at] of seenAuditEntries.entries()) {
    if (now - at > SEEN_TTL_MS) {
      seenAuditEntries.delete(key);
    }
  }
}

function auditEntryKey(guildId, entry) {
  return `${guildId}:${entry.id}`;
}

function targetMatches(entry, targetId) {
  if (!targetId) return true;
  return entry.target?.id === targetId || entry.extra?.id === targetId;
}

function isFreshEntry(entry, maxAgeMs = 10_000) {
  const created = entry.createdTimestamp || 0;
  return created && Date.now() - created <= maxAgeMs;
}

async function fetchAuditEntry(guild, options = {}) {
  const {
    auditType,
    targetId = null,
    maxAgeMs = 10_000,
    delayMs = 800,
    retries = 2,
    allowSeen = false
  } = options;

  if (!guild || !auditType) return null;

  cleanupSeen();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    if (attempt > 0 || delayMs > 0) {
      await sleep(attempt === 0 ? delayMs : 600);
    }

    const logs = await guild.fetchAuditLogs({
      type: auditType,
      limit: 8
    }).catch((error) => {
      logger.warn(
        {
          error,
          guildId: guild.id,
          auditType,
          targetId
        },
        'Anti-nuke audit log fetch failed'
      );

      return null;
    });

    const entry = logs?.entries?.find((item) => {
      if (!item?.executor?.id) return false;
      if (!isFreshEntry(item, maxAgeMs)) return false;
      if (!targetMatches(item, targetId)) return false;

      const key = auditEntryKey(guild.id, item);
      if (!allowSeen && seenAuditEntries.has(key)) return false;

      return true;
    });

    if (entry) {
      seenAuditEntries.set(auditEntryKey(guild.id, entry), Date.now());

      return {
        id: entry.id,
        executor: entry.executor,
        target: entry.target,
        targetId: entry.target?.id || targetId || null,
        reason: entry.reason || null,
        changes: entry.changes || [],
        extra: entry.extra || null,
        createdTimestamp: entry.createdTimestamp,
        auditType
      };
    }
  }

  return null;
}

async function resolveExecutor(guild, action, targetId, options = {}) {
  if (!action?.auditType) return null;

  return fetchAuditEntry(guild, {
    auditType: action.auditType,
    targetId,
    maxAgeMs: options.maxAgeMs || 12_000,
    delayMs: options.delayMs ?? 800,
    retries: options.retries ?? 2,
    allowSeen: options.allowSeen || false
  });
}

async function resolveAnyExecutor(guild, candidates = [], targetId = null, options = {}) {
  for (const candidate of candidates) {
    const audit = await fetchAuditEntry(guild, {
      auditType: candidate.auditType,
      targetId,
      maxAgeMs: options.maxAgeMs || 12_000,
      delayMs: options.delayMs ?? 500,
      retries: options.retries ?? 1,
      allowSeen: options.allowSeen || false
    });

    if (audit) {
      return {
        ...audit,
        actionType: candidate.actionType
      };
    }
  }

  return null;
}

module.exports = {
  fetchAuditEntry,
  resolveExecutor,
  resolveAnyExecutor
};