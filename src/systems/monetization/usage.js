const db = require('../../services/database');

const USAGE_NAMESPACE = 'premium:usage';

function utcDateKey(now = new Date()) {
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const day = String(now.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function nextUtcResetIso(now = new Date()) {
  return new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
    0
  )).toISOString();
}

function usageKey(feature, scopeKey, dateKey = utcDateKey()) {
  return `${feature}:${scopeKey}:${dateKey}`;
}

async function getDailyUsage(feature, scopeKey, dateKey = utcDateKey()) {
  return db.getKv(USAGE_NAMESPACE, usageKey(feature, scopeKey, dateKey), {
    used: 0,
    resetAt: nextUtcResetIso()
  });
}

async function consumeDailyUsage(feature, scopeKey, limit, amount = 1) {
  if (!Number.isFinite(limit) || limit <= 0) {
    return {
      ok: false,
      used: 0,
      remaining: 0,
      limit
    };
  }

  const key = usageKey(feature, scopeKey);
  const current = await db.getKv(USAGE_NAMESPACE, key, {
    used: 0,
    resetAt: nextUtcResetIso()
  });
  const used = Number(current.used || 0);

  if (used + amount > limit) {
    return {
      ok: false,
      used,
      remaining: Math.max(0, limit - used),
      limit,
      resetAt: current.resetAt || nextUtcResetIso()
    };
  }

  const next = {
    used: used + amount,
    resetAt: current.resetAt || nextUtcResetIso()
  };

  await db.setKv(USAGE_NAMESPACE, key, next);

  return {
    ok: true,
    used: next.used,
    remaining: Math.max(0, limit - next.used),
    limit,
    resetAt: next.resetAt
  };
}

module.exports = {
  utcDateKey,
  nextUtcResetIso,
  getDailyUsage,
  consumeDailyUsage
};
