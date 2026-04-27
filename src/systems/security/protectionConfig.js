const db = require('../../services/database');
const { DEFAULT_THRESHOLDS } = require('../../utils/constants');
const logger = require('../logging/logger');

const DEFAULT_ANTINUKE = Object.freeze({
  enabled: false,
  punishment: 'strip',
  whitelist: []
});

const DEFAULT_ANTIRAID = Object.freeze({
  enabled: false,
  action: 'alert',
  whitelist: [],
  verificationChannelId: null,
  timeoutMinutes: 30
});

const DEFAULT_SECURITY = Object.freeze({
  enabled: true
});
const cache = new Map();
const CACHE_TTL_MS = Math.max(5000, Number(process.env.PROTECTION_CACHE_TTL_MS || 15000));

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeAntinukeConfig(value = {}) {
  return {
    ...clone(DEFAULT_ANTINUKE),
    ...(value || {}),
    whitelist: normalizeList(value?.whitelist)
  };
}

function normalizeAntiraidConfig(value = {}) {
  const timeoutMinutes = Number(value?.timeoutMinutes);

  return {
    ...clone(DEFAULT_ANTIRAID),
    ...(value || {}),
    whitelist: normalizeList(value?.whitelist),
    timeoutMinutes: Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
      ? Math.min(720, Math.max(1, Math.round(timeoutMinutes)))
      : DEFAULT_ANTIRAID.timeoutMinutes
  };
}

function normalizeSecurityConfig(value = {}) {
  return {
    ...clone(DEFAULT_SECURITY),
    ...(value || {}),
    enabled: value?.enabled !== false
  };
}

function getCached(guildId, allowStale = false) {
  const entry = cache.get(guildId);
  if (!entry) return null;
  if (allowStale || Date.now() - entry.at <= CACHE_TTL_MS) return clone(entry.value);
  cache.delete(guildId);
  return null;
}

async function getProtectionSettings(guildId) {
  const fresh = getCached(guildId);
  if (fresh) return fresh;

  try {
    const [row, securityRow] = await Promise.all([
      db.getGuildSettings(guildId),
      db.getGuildSecurityConfig(guildId).catch(() => null)
    ]);
    const settings = row.settings_json || {};
    const security = normalizeSecurityConfig(securityRow?.security_json || settings.security);
    const antinuke = normalizeAntinukeConfig(securityRow?.antinuke_json || settings.antinuke);
    const antiraid = normalizeAntiraidConfig(securityRow?.antiraid_json || settings.antiraid);
    const value = {
      row,
      securityRow,
      settings: {
        ...settings,
        security,
        antinuke,
        antiraid
      },
      thresholds: securityRow?.thresholds_json || row.thresholds_json || clone(DEFAULT_THRESHOLDS),
      security,
      antinuke,
      antiraid
    };
    cache.set(guildId, { value: clone(value), at: Date.now() });
    return value;
  } catch (error) {
    const stale = getCached(guildId, true);
    if (stale) {
      logger.warn({ error, guildId }, 'Using cached protection settings after database failure');
      return stale;
    }
    throw error;
  }
}

async function updateProtectionSection(guildId, section, updater) {
  const columnMap = {
    security: 'security_json',
    antinuke: 'antinuke_json',
    antiraid: 'antiraid_json'
  };
  const column = columnMap[section];
  if (!column) {
    throw new Error(`Unknown protection section: ${section}`);
  }

  const row = await db.getGuildSecurityConfig(guildId);
  const current = row[column] || {};
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;

  await db.updateGuildSecurityConfig(guildId, {
    [column]: next
  });
  cache.delete(guildId);

  return next;
}

async function updateProtectionThresholds(guildId, updater) {
  const row = await db.getGuildSecurityConfig(guildId);
  const current = row.thresholds_json || clone(DEFAULT_THRESHOLDS);
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;

  await db.updateGuildSecurityConfig(guildId, {
    thresholds_json: next
  });
  cache.delete(guildId);
  return next;
}

async function updateProtectionConfig(guildId, updater) {
  const current = await getProtectionSettings(guildId);
  const next = typeof updater === 'function' ? updater(clone(current)) : updater;

  await db.updateGuildSecurityConfig(guildId, {
    security_json: next?.security || current.security,
    antinuke_json: next?.antinuke || current.antinuke,
    antiraid_json: next?.antiraid || current.antiraid,
    thresholds_json: next?.thresholds || current.thresholds
  });
  cache.delete(guildId);
  return getProtectionSettings(guildId);
}

function isSecuritySystemEnabled(protection, section, fallback = true) {
  if (!protection) return fallback;
  if (protection.security?.enabled === false) return false;

  if (section === 'automod') {
    return protection.row?.automod_enabled !== false;
  }

  if (section === 'autojail') {
    return protection.row?.jail_enabled !== false;
  }

  const local = protection[section];
  if (local && typeof local === 'object' && Object.prototype.hasOwnProperty.call(local, 'enabled')) {
    return local.enabled !== false;
  }

  return fallback;
}

module.exports = {
  DEFAULT_SECURITY,
  DEFAULT_ANTINUKE,
  DEFAULT_ANTIRAID,
  normalizeSecurityConfig,
  normalizeAntinukeConfig,
  normalizeAntiraidConfig,
  getProtectionSettings,
  updateProtectionSection,
  updateProtectionThresholds,
  updateProtectionConfig,
  isSecuritySystemEnabled
};
