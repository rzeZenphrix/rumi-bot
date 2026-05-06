const db = require('../../services/database');
const logger = require('../logging/logger');

const {
  DEFAULT_ANTINUKE,
  normalizeAntinukeConfig
} = require('../antinuke/config');

const {
  DEFAULT_ANTIRAID,
  normalizeAntiraidConfig: normalizeAdvancedAntiraidConfig
} = require('../antiraid/config');

const SECURITY_SYSTEMS = [
  'antinuke',
  'antiraid',
  'automod',
  'autojail',
  'jail',
  'verification'
];

const SECTION_COLUMNS = {
  antinuke: 'antinuke_json',
  antiraid: 'antiraid_json',
  automod: 'automod_json',
  autojail: 'autojail_json',
  jail: 'jail_json',
  verification: 'verification_json'
};

const DEFAULT_AUTOMOD = {
  enabled: false,
  preset: 'normal',
  logChannelId: null,
  alertRoleId: null,
  ownerDm: false,

  spam: {
    enabled: true,
    limit: 5,
    windowSeconds: 8,
    punishment: ['delete', 'timeout']
  },

  links: {
    enabled: false,
    blockInvites: true,
    blockedDomains: [],
    allowedDomains: [],
    punishment: ['delete', 'timeout']
  },

  mentions: {
    enabled: true,
    userLimit: 8,
    roleLimit: 4,
    everyone: true,
    punishment: ['delete', 'timeout']
  },

  words: {
    enabled: false,
    blocked: [],
    punishment: ['delete', 'timeout']
  }
};

const DEFAULT_AUTOJAIL = {
  enabled: false,
  roleId: null,
  logChannelId: null,
  rules: []
};

const DEFAULT_JAIL = {
  enabled: false,
  roleId: null,
  logChannelId: null,
  removeRolesOnJail: true,
  restoreRolesOnUnjail: true
};

const DEFAULT_VERIFICATION = {
  enabled: false,
  mode: 'captcha',

  unverifiedRoleId: null,
  verifiedRoleId: null,

  verifyChannelId: null,
  verifyMessageId: null,

  reactionEmojiId: null,
  reactionEmojiName: null,

  captchaExpiresMinutes: 10,
  captchaMaxAttempts: 3,

  assignUnverifiedOnJoin: true,
  removeUnverifiedOnVerify: true,

  // legacy compatibility
  roleId: null,
  channelId: null
};

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeBoolean(value, fallback = false) {
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

function normalizeId(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizeList(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function normalizeActions(value) {
  const source = Array.isArray(value) ? value : [value];

  return [...new Set(
    source
      .flatMap((item) => String(item || '').split(/[,\s]+/g))
      .map((item) => item.trim().toLowerCase().replaceAll('-', '_'))
      .filter(Boolean)
  )];
}

function normalizeAutomodConfig(value = {}) {
  const input = asObject(value);
  const defaults = clone(DEFAULT_AUTOMOD);

  return {
    ...defaults,
    ...input,

    enabled: normalizeBoolean(input.enabled, defaults.enabled),
    preset: String(input.preset || defaults.preset),

    logChannelId: normalizeId(input.logChannelId),
    alertRoleId: normalizeId(input.alertRoleId),
    ownerDm: normalizeBoolean(input.ownerDm, defaults.ownerDm),

    spam: {
      ...defaults.spam,
      ...asObject(input.spam),
      enabled: normalizeBoolean(input.spam?.enabled, defaults.spam.enabled),
      limit: Math.max(2, Math.min(100, Number(input.spam?.limit || defaults.spam.limit))),
      windowSeconds: Math.max(2, Math.min(3600, Number(input.spam?.windowSeconds || defaults.spam.windowSeconds))),
      punishment: normalizeActions(input.spam?.punishment).length
        ? normalizeActions(input.spam?.punishment)
        : defaults.spam.punishment
    },

    links: {
      ...defaults.links,
      ...asObject(input.links),
      enabled: normalizeBoolean(input.links?.enabled, defaults.links.enabled),
      blockInvites: normalizeBoolean(input.links?.blockInvites, defaults.links.blockInvites),
      blockedDomains: normalizeList(input.links?.blockedDomains),
      allowedDomains: normalizeList(input.links?.allowedDomains),
      punishment: normalizeActions(input.links?.punishment).length
        ? normalizeActions(input.links?.punishment)
        : defaults.links.punishment
    },

    mentions: {
      ...defaults.mentions,
      ...asObject(input.mentions),
      enabled: normalizeBoolean(input.mentions?.enabled, defaults.mentions.enabled),
      userLimit: Math.max(1, Math.min(100, Number(input.mentions?.userLimit || defaults.mentions.userLimit))),
      roleLimit: Math.max(1, Math.min(100, Number(input.mentions?.roleLimit || defaults.mentions.roleLimit))),
      everyone: normalizeBoolean(input.mentions?.everyone, defaults.mentions.everyone),
      punishment: normalizeActions(input.mentions?.punishment).length
        ? normalizeActions(input.mentions?.punishment)
        : defaults.mentions.punishment
    },

    words: {
      ...defaults.words,
      ...asObject(input.words),
      enabled: normalizeBoolean(input.words?.enabled, defaults.words.enabled),
      blocked: normalizeList(input.words?.blocked),
      punishment: normalizeActions(input.words?.punishment).length
        ? normalizeActions(input.words?.punishment)
        : defaults.words.punishment
    }
  };
}

function normalizeAutoJailConfig(value = {}) {
  const input = asObject(value);
  const defaults = clone(DEFAULT_AUTOJAIL);

  return {
    ...defaults,
    ...input,
    enabled: normalizeBoolean(input.enabled, defaults.enabled),
    roleId: normalizeId(input.roleId),
    logChannelId: normalizeId(input.logChannelId),
    rules: Array.isArray(input.rules) ? input.rules : []
  };
}

function normalizeJailConfig(value = {}) {
  const input = asObject(value);
  const defaults = clone(DEFAULT_JAIL);

  return {
    ...defaults,
    ...input,
    enabled: normalizeBoolean(input.enabled, defaults.enabled),
    roleId: normalizeId(input.roleId),
    logChannelId: normalizeId(input.logChannelId),
    removeRolesOnJail: normalizeBoolean(input.removeRolesOnJail, defaults.removeRolesOnJail),
    restoreRolesOnUnjail: normalizeBoolean(input.restoreRolesOnUnjail, defaults.restoreRolesOnUnjail)
  };
}

function normalizeVerificationConfig(value = {}) {
  const input = asObject(value);
  const defaults = clone(DEFAULT_VERIFICATION);

  const mode = String(input.mode || defaults.mode).toLowerCase();

  const unverifiedRoleId = normalizeId(input.unverifiedRoleId);
  const verifiedRoleId = normalizeId(input.verifiedRoleId || input.roleId);

  const verifyChannelId = normalizeId(input.verifyChannelId || input.channelId);
  const verifyMessageId = normalizeId(input.verifyMessageId);

  return {
    ...defaults,
    ...input,

    enabled: normalizeBoolean(input.enabled, defaults.enabled),
    mode: ['captcha', 'reaction'].includes(mode) ? mode : 'captcha',

    unverifiedRoleId,
    verifiedRoleId,

    verifyChannelId,
    verifyMessageId,

    reactionEmojiId: normalizeId(input.reactionEmojiId),
    reactionEmojiName: input.reactionEmojiName ? String(input.reactionEmojiName) : null,

    captchaExpiresMinutes: Math.max(
      1,
      Math.min(60, Number(input.captchaExpiresMinutes || defaults.captchaExpiresMinutes))
    ),

    captchaMaxAttempts: Math.max(
      1,
      Math.min(10, Number(input.captchaMaxAttempts || defaults.captchaMaxAttempts))
    ),

    assignUnverifiedOnJoin: input.assignUnverifiedOnJoin !== false,
    removeUnverifiedOnVerify: input.removeUnverifiedOnVerify !== false,

    // legacy compatibility
    roleId: verifiedRoleId,
    channelId: verifyChannelId
  };
}

/**
 * Keep this wrapper name for backward compatibility.
 * Do not import normalizeAntiraidConfig directly with the same name above,
 * otherwise Node will throw "Identifier has already been declared".
 */
function normalizeAntiraidConfig(value = {}) {
  return normalizeAdvancedAntiraidConfig(value || {});
}

function normalizeSection(section, value = {}) {
  if (section === 'antinuke') return normalizeAntinukeConfig(value || {});
  if (section === 'antiraid') return normalizeAntiraidConfig(value || {});
  if (section === 'automod') return normalizeAutomodConfig(value || {});
  if (section === 'autojail') return normalizeAutoJailConfig(value || {});
  if (section === 'jail') return normalizeJailConfig(value || {});
  if (section === 'verification') return normalizeVerificationConfig(value || {});

  return asObject(value);
}

async function callFirstAvailable(methodNames, args, label) {
  for (const name of methodNames) {
    if (typeof db[name] !== 'function') continue;

    return db[name](...args);
  }

  throw new Error(
    `${label} needs one of these database helpers: ${methodNames.join(', ')}`
  );
}

async function getSecurityRow(guildId) {
  try {
    const row = await callFirstAvailable(
      [
        'getGuildSecurityConfig',
        'getGuildSecuritySettings',
        'getSecurityConfig',
        'getSecuritySettings',
        'getGuildProtectionConfig',
        'getProtectionConfig'
      ],
      [guildId],
      'getSecurityRow'
    );

    return row || {};
  } catch (error) {
    logger.warn(
      {
        error,
        guildId
      },
      'Could not load guild security config row'
    );

    return {};
  }
}

async function getLegacyGuildSettings(guildId) {
  if (typeof db.getGuildSettings !== 'function') return {};

  return db.getGuildSettings(guildId).catch(() => ({}));
}

async function saveSecurityRow(guildId, patch) {
  const row = {
    guild_id: guildId,
    guildId,
    ...patch
  };

  const methodNames = [
    'upsertGuildSecurityConfig',
    'updateGuildSecurityConfig',
    'setGuildSecurityConfig',
    'updateSecurityConfig',
    'setSecurityConfig',
    'updateGuildProtectionConfig',
    'setProtectionConfig'
  ];

  let lastError = null;

  for (const name of methodNames) {
    if (typeof db[name] !== 'function') continue;

    try {
      /**
       * Support both common signatures:
       * updateGuildSecurityConfig(guildId, patch)
       * upsertGuildSecurityConfig(row)
       */
      if (db[name].length >= 2) {
        return await db[name](guildId, patch);
      }

      return await db[name](row);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(
    `saveSecurityRow needs one of these database helpers: ${methodNames.join(', ')}`
  );
}

function buildSettingsFromRow(securityRow = {}, legacySettings = {}) {
  const settings = asObject(legacySettings);

  const antinukeRaw =
    securityRow.antinuke_json ||
    securityRow.antinuke ||
    settings.antinuke ||
    DEFAULT_ANTINUKE ||
    {};

  const antiraidRaw =
    securityRow.antiraid_json ||
    securityRow.antiraid ||
    settings.antiraid ||
    DEFAULT_ANTIRAID ||
    {};

  const automodRaw =
    securityRow.automod_json ||
    securityRow.automod ||
    settings.automod ||
    DEFAULT_AUTOMOD;

  const autojailRaw =
    securityRow.autojail_json ||
    securityRow.autojail ||
    settings.autojail ||
    DEFAULT_AUTOJAIL;

  const jailRaw =
    securityRow.jail_json ||
    securityRow.jail ||
    settings.jail ||
    DEFAULT_JAIL;

  const verificationRaw =
    securityRow.verification_json ||
    securityRow.verification ||
    settings.verification ||
    DEFAULT_VERIFICATION;

  return {
    ...settings,

    guildId: securityRow.guild_id || securityRow.guildId || settings.guildId || settings.guild_id || null,
    guild_id: securityRow.guild_id || settings.guild_id || null,

    antinuke: normalizeSection('antinuke', antinukeRaw),
    antiraid: normalizeSection('antiraid', antiraidRaw),
    automod: normalizeSection('automod', automodRaw),
    autojail: normalizeSection('autojail', autojailRaw),
    jail: normalizeSection('jail', jailRaw),
    verification: normalizeSection('verification', verificationRaw)
  };
}

async function getProtectionSettings(guildId) {
  const [securityRow, legacySettings] = await Promise.all([
    getSecurityRow(guildId),
    getLegacyGuildSettings(guildId)
  ]);

  return buildSettingsFromRow(securityRow, legacySettings);
}

function isSecuritySystemEnabled(protection, system) {
  if (!protection || !system) return false;

  const key = String(system).toLowerCase();

  if (!SECURITY_SYSTEMS.includes(key)) return false;

  const section = protection[key];

  if (section && typeof section === 'object') {
    return section.enabled === true;
  }

  return section === true;
}

async function updateProtectionSection(guildId, section, updater) {
  const key = String(section || '').toLowerCase();

  if (!SECURITY_SYSTEMS.includes(key)) {
    throw new Error(`Unknown security section: ${section}`);
  }

  const protection = await getProtectionSettings(guildId);
  const current = normalizeSection(key, protection[key] || {});
  const nextRaw = typeof updater === 'function' ? updater(current, protection) : updater;
  const next = normalizeSection(key, nextRaw || {});

  const column = SECTION_COLUMNS[key];

  const saved = await saveSecurityRow(guildId, {
    [column]: next,
    updated_at: new Date().toISOString()
  });

  if (saved && typeof saved === 'object') {
    if (saved[column]) return normalizeSection(key, saved[column]);
    if (saved[key]) return normalizeSection(key, saved[key]);
  }

  return next;
}

async function setProtectionSection(guildId, section, value) {
  return updateProtectionSection(guildId, section, value);
}

async function getProtectionSection(guildId, section) {
  const protection = await getProtectionSettings(guildId);
  const key = String(section || '').toLowerCase();

  return normalizeSection(key, protection[key] || {});
}

async function enableSecuritySystem(guildId, system) {
  const key = String(system || '').toLowerCase();

  if (!SECURITY_SYSTEMS.includes(key)) {
    throw new Error(`Unknown security system: ${system}`);
  }

  return updateProtectionSection(guildId, key, (current) => ({
    ...current,
    enabled: true
  }));
}

async function disableSecuritySystem(guildId, system) {
  const key = String(system || '').toLowerCase();

  if (!SECURITY_SYSTEMS.includes(key)) {
    throw new Error(`Unknown security system: ${system}`);
  }

  return updateProtectionSection(guildId, key, (current) => ({
    ...current,
    enabled: false
  }));
}

module.exports = {
  SECURITY_SYSTEMS,
  SECTION_COLUMNS,

  DEFAULT_AUTOMOD,
  DEFAULT_AUTOJAIL,
  DEFAULT_JAIL,
  DEFAULT_VERIFICATION,

  normalizeAutomodConfig,
  normalizeAutoJailConfig,
  normalizeJailConfig,
  normalizeVerificationConfig,
  normalizeAntiraidConfig,

  getProtectionSettings,
  getProtectionSection,
  setProtectionSection,
  updateProtectionSection,

  enableSecuritySystem,
  disableSecuritySystem,
  isSecuritySystemEnabled
};