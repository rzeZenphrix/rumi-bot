const {
  ACTIONS,
  PUNISHMENT_TYPES,
  ROLLBACK_MODES,
  normalizePunishments,
  normalizeRollbackMode
} = require('./actionTypes');

const LIMIT_MIN = 1;
const LIMIT_MAX = 50;
const WINDOW_MIN_SECONDS = 5;
const WINDOW_MAX_SECONDS = 3600;
const WEIGHT_MIN = 1;
const WEIGHT_MAX = 50;

const DEFAULT_ANTINUKE = Object.freeze({
  enabled: false,
  preset: 'normal',

  defaultPunishments: ['staff_strip', 'strip', 'timeout'],
  punishment: 'strip',

  timeoutMs: 24 * 60 * 60 * 1000,
  severeTimeoutMs: 7 * 24 * 60 * 60 * 1000,

  admins: [],
  whitelist: [],
  trustedUsers: [],
  trustedRoles: [],
  trustedBots: [],

  trustNoOne: {
    enabled: false,
    overboundPercent: 75,
    includeTrustedUsers: true,
    includeTrustedRoles: true,
    includeTrustedBots: true,
    includeWhitelist: true,
    includeAntinukeAdmins: true,
    includeFakePermissionBypass: true,
    action: 'mitigate'
  },

  logChannelId: null,
  alertRoleId: null,
  ownerDm: false,

  rollback: {
    enabled: true,
    mode: 'standard'
  },

  lockdown: {
    enabled: false,
    mode: 'verification-channel',
    durationSeconds: 600
  },

  combinedScore: {
    enabled: true,
    limit: 20,
    windowSeconds: 30
  },

  actions: {}
});

function normalizeTrustNoOne(value = {}) {
  return {
    enabled: value?.enabled === true,
    overboundPercent: clampNumber(value?.overboundPercent, 75, 0, 500),

    includeTrustedUsers: value?.includeTrustedUsers !== false,
    includeTrustedRoles: value?.includeTrustedRoles !== false,
    includeTrustedBots: value?.includeTrustedBots !== false,
    includeWhitelist: value?.includeWhitelist !== false,
    includeAntinukeAdmins: value?.includeAntinukeAdmins !== false,
    includeFakePermissionBypass: value?.includeFakePermissionBypass !== false,

    action: ['alert', 'mitigate'].includes(String(value?.action || '').toLowerCase())
      ? String(value.action).toLowerCase()
      : 'mitigate'
  };
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

function normalizeActionConfig(actionId, value = {}) {
  const defaults = ACTIONS[actionId];

  const punishments = normalizePunishments(value.punishments || value.punishment);

  return {
    enabled: normalizeBoolean(value.enabled, defaults.enabled !== false),
    limit: clampNumber(value.limit, defaults.limit, LIMIT_MIN, LIMIT_MAX),
    windowSeconds: clampNumber(value.windowSeconds, defaults.windowSeconds, WINDOW_MIN_SECONDS, WINDOW_MAX_SECONDS),
    weight: clampNumber(value.weight, defaults.weight, WEIGHT_MIN, WEIGHT_MAX),
    punishments,
    rollback: normalizeRollbackMode(value.rollback) || defaults.rollback || 'off'
  };
}

function normalizeActions(value = {}) {
  const output = {};

  for (const actionId of Object.keys(ACTIONS)) {
    output[actionId] = normalizeActionConfig(actionId, value[actionId] || {});
  }

  return output;
}

function normalizeRollback(value = {}) {
  const mode = normalizeRollbackMode(value?.mode) || DEFAULT_ANTINUKE.rollback.mode;

  return {
    enabled: normalizeBoolean(value?.enabled, DEFAULT_ANTINUKE.rollback.enabled),
    mode
  };
}

function normalizeLockdown(value = {}) {
  const mode = String(value?.mode || DEFAULT_ANTINUKE.lockdown.mode).trim().toLowerCase();

  return {
    enabled: normalizeBoolean(value?.enabled, DEFAULT_ANTINUKE.lockdown.enabled),
    mode,
    durationSeconds: clampNumber(value?.durationSeconds, DEFAULT_ANTINUKE.lockdown.durationSeconds, 30, 86400)
  };
}

function normalizeCombinedScore(value = {}) {
  return {
    enabled: normalizeBoolean(value?.enabled, DEFAULT_ANTINUKE.combinedScore.enabled),
    limit: clampNumber(value?.limit, DEFAULT_ANTINUKE.combinedScore.limit, 5, 200),
    windowSeconds: clampNumber(value?.windowSeconds, DEFAULT_ANTINUKE.combinedScore.windowSeconds, 5, 3600)
  };
}

function normalizeDefaultPunishments(value, oldPunishment) {
  const fromValue = normalizePunishments(value);
  if (fromValue.length) return fromValue;

  const fromOld = normalizePunishments(oldPunishment);
  if (fromOld.length) return fromOld;

  return [...DEFAULT_ANTINUKE.defaultPunishments];
}

function normalizeAntinukeConfig(value = {}) {
  const output = {
    ...DEFAULT_ANTINUKE,
    ...value
  };

  output.enabled = value.enabled === true;
  output.preset = String(value.preset || DEFAULT_ANTINUKE.preset).toLowerCase();

  output.defaultPunishments = normalizeDefaultPunishments(
    value.defaultPunishments || value.punishments,
    value.punishment
  );

  output.punishment = output.defaultPunishments[0] || 'strip';

  output.timeoutMs = clampNumber(value.timeoutMs, DEFAULT_ANTINUKE.timeoutMs, 60_000, 28 * 24 * 60 * 60 * 1000);
  output.severeTimeoutMs = clampNumber(value.severeTimeoutMs, DEFAULT_ANTINUKE.severeTimeoutMs, 60_000, 28 * 24 * 60 * 60 * 1000);

  output.admins = normalizeList(value.admins);
  output.whitelist = normalizeList(value.whitelist);
  output.trustedUsers = normalizeList(value.trustedUsers);
  output.trustedRoles = normalizeList(value.trustedRoles);
  output.trustedBots = normalizeList(value.trustedBots);
  output.trustNoOne = normalizeTrustNoOne(value.trustNoOne);

  output.logChannelId = value.logChannelId ? String(value.logChannelId) : null;
  output.alertRoleId = value.alertRoleId ? String(value.alertRoleId) : null;
  output.ownerDm = value.ownerDm === true;

  output.rollback = normalizeRollback(value.rollback);
  output.lockdown = normalizeLockdown(value.lockdown);
  output.combinedScore = normalizeCombinedScore(value.combinedScore);
  output.actions = normalizeActions(value.actions);

  return output;
}

function isValidPunishment(value) {
  return PUNISHMENT_TYPES.includes(value);
}

function isValidRollbackMode(value) {
  return ROLLBACK_MODES.includes(value);
}

module.exports = {
  DEFAULT_ANTINUKE,
  LIMIT_MIN,
  LIMIT_MAX,
  WINDOW_MIN_SECONDS,
  WINDOW_MAX_SECONDS,
  WEIGHT_MIN,
  WEIGHT_MAX,
  normalizeAntinukeConfig,
  normalizeActionConfig,
  normalizeActions,
  normalizeDefaultPunishments,
  normalizeTrustNoOne,
  isValidPunishment,
  isValidRollbackMode
};