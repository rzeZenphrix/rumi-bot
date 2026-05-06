const RAID_ACTIONS = Object.freeze([
  'none',
  'alert',
  'verify',
  'quarantine',
  'jail',
  'timeout',
  'kick',
  'ban',
  'softban',
  'delete',
  'slowmode',
  'lockdown',
  'raidmode',
  'delete_webhook'
]);

const RAID_SEVERITIES = Object.freeze([
  'low',
  'medium',
  'high',
  'critical'
]);

const RAID_PRESETS = Object.freeze([
  'low',
  'normal',
  'strict',
  'paranoid',
  'custom'
]);

const DEFAULT_ANTIRAID = Object.freeze({
  enabled: false,
  preset: 'normal',

  admins: [],

  trustedUsers: [],
  trustedRoles: [],
  trustedBots: [],

  ignoredChannels: [],
  ignoredRoles: [],
  ignoredInvites: [],
  ignoredDomains: [],

  logChannelId: null,
  alertRoleId: null,
  ownerDm: false,

  quarantineRoleId: null,
  verificationRoleId: null,
  verificationChannelId: null,

  raidMode: {
    enabled: true,
    active: false,
    activeIncidentId: null,
    startedAt: null,
    endsAt: null,

    durationSeconds: 600,
    quietSecondsToEnd: 180,

    actions: ['quarantine', 'slowmode'],
    slowmodeSeconds: 10,
    lockChannels: false
  },

  join: {
    enabled: true,
    limit: 8,
    windowSeconds: 20,

    memberRiskThreshold: 50,
    waveRiskThreshold: 70,

    accountAgeHours: 24,

    punishments: {
      medium: ['verify'],
      high: ['quarantine', 'timeout'],
      critical: ['ban']
    }
  },

  botRaid: {
    enabled: true,
    limit: 3,
    windowSeconds: 60,
    punishment: ['kick']
  },

  message: {
    enabled: true,

    newMemberWindowMinutes: 30,

    spamLimit: 5,
    spamWindowSeconds: 8,

    mentionLimit: 8,
    linkLimit: 3,
    duplicateLimit: 4,

    punishment: ['delete', 'timeout']
  },

  invite: {
    enabled: true,
    singleInviteJoinLimit: 8,
    windowSeconds: 60,
    action: ['raidmode']
  },

  webhook: {
    enabled: true,
    messageLimit: 5,
    windowSeconds: 10,
    action: ['delete_webhook', 'lockdown']
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
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

function normalizeAction(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_');

  return RAID_ACTIONS.includes(normalized) ? normalized : null;
}

function normalizeActions(value) {
  const source = Array.isArray(value) ? value : [value];

  return [...new Set(
    source
      .flatMap((item) => String(item || '').split(/[,\s]+/g))
      .map(normalizeAction)
      .filter(Boolean)
  )];
}

function normalizeSeverity(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return RAID_SEVERITIES.includes(normalized) ? normalized : null;
}

function normalizePreset(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return RAID_PRESETS.includes(normalized) ? normalized : 'normal';
}

function normalizePunishmentBands(value = {}) {
  const defaults = DEFAULT_ANTIRAID.join.punishments;

  return {
    medium: normalizeActions(value.medium).length ? normalizeActions(value.medium) : [...defaults.medium],
    high: normalizeActions(value.high).length ? normalizeActions(value.high) : [...defaults.high],
    critical: normalizeActions(value.critical).length ? normalizeActions(value.critical) : [...defaults.critical]
  };
}

function normalizeRaidMode(value = {}) {
  const defaults = DEFAULT_ANTIRAID.raidMode;

  return {
    enabled: normalizeBoolean(value.enabled, defaults.enabled),
    active: normalizeBoolean(value.active, false),
    activeIncidentId: normalizeId(value.activeIncidentId),
    startedAt: value.startedAt || null,
    endsAt: value.endsAt || null,

    durationSeconds: clampNumber(value.durationSeconds, defaults.durationSeconds, 60, 86400),
    quietSecondsToEnd: clampNumber(value.quietSecondsToEnd, defaults.quietSecondsToEnd, 30, 3600),

    actions: normalizeActions(value.actions).length ? normalizeActions(value.actions) : [...defaults.actions],
    slowmodeSeconds: clampNumber(value.slowmodeSeconds, defaults.slowmodeSeconds, 0, 21600),
    lockChannels: normalizeBoolean(value.lockChannels, defaults.lockChannels)
  };
}

function normalizeJoinConfig(value = {}) {
  const defaults = DEFAULT_ANTIRAID.join;

  return {
    enabled: normalizeBoolean(value.enabled, defaults.enabled),
    limit: clampNumber(value.limit, defaults.limit, 2, 200),
    windowSeconds: clampNumber(value.windowSeconds, defaults.windowSeconds, 5, 3600),

    memberRiskThreshold: clampNumber(value.memberRiskThreshold, defaults.memberRiskThreshold, 1, 100),
    waveRiskThreshold: clampNumber(value.waveRiskThreshold, defaults.waveRiskThreshold, 1, 100),

    accountAgeHours: clampNumber(value.accountAgeHours, defaults.accountAgeHours, 1, 87600),

    punishments: normalizePunishmentBands(value.punishments || {})
  };
}

function normalizeBotRaidConfig(value = {}) {
  const defaults = DEFAULT_ANTIRAID.botRaid;

  return {
    enabled: normalizeBoolean(value.enabled, defaults.enabled),
    limit: clampNumber(value.limit, defaults.limit, 1, 100),
    windowSeconds: clampNumber(value.windowSeconds, defaults.windowSeconds, 5, 3600),
    punishment: normalizeActions(value.punishment).length ? normalizeActions(value.punishment) : [...defaults.punishment]
  };
}

function normalizeMessageConfig(value = {}) {
  const defaults = DEFAULT_ANTIRAID.message;

  return {
    enabled: normalizeBoolean(value.enabled, defaults.enabled),

    newMemberWindowMinutes: clampNumber(value.newMemberWindowMinutes, defaults.newMemberWindowMinutes, 1, 10080),

    spamLimit: clampNumber(value.spamLimit, defaults.spamLimit, 2, 100),
    spamWindowSeconds: clampNumber(value.spamWindowSeconds, defaults.spamWindowSeconds, 2, 3600),

    mentionLimit: clampNumber(value.mentionLimit, defaults.mentionLimit, 1, 100),
    linkLimit: clampNumber(value.linkLimit, defaults.linkLimit, 1, 100),
    duplicateLimit: clampNumber(value.duplicateLimit, defaults.duplicateLimit, 2, 100),

    punishment: normalizeActions(value.punishment).length ? normalizeActions(value.punishment) : [...defaults.punishment]
  };
}

function normalizeInviteConfig(value = {}) {
  const defaults = DEFAULT_ANTIRAID.invite;

  return {
    enabled: normalizeBoolean(value.enabled, defaults.enabled),
    singleInviteJoinLimit: clampNumber(value.singleInviteJoinLimit, defaults.singleInviteJoinLimit, 2, 500),
    windowSeconds: clampNumber(value.windowSeconds, defaults.windowSeconds, 5, 3600),
    action: normalizeActions(value.action).length ? normalizeActions(value.action) : [...defaults.action]
  };
}

function normalizeWebhookConfig(value = {}) {
  const defaults = DEFAULT_ANTIRAID.webhook;

  return {
    enabled: normalizeBoolean(value.enabled, defaults.enabled),
    messageLimit: clampNumber(value.messageLimit, defaults.messageLimit, 2, 100),
    windowSeconds: clampNumber(value.windowSeconds, defaults.windowSeconds, 2, 3600),
    action: normalizeActions(value.action).length ? normalizeActions(value.action) : [...defaults.action]
  };
}

function normalizeAntiraidConfig(value = {}) {
  const output = {
    ...clone(DEFAULT_ANTIRAID),
    ...(value || {})
  };

  output.enabled = value.enabled === true;
  output.preset = normalizePreset(value.preset);

  output.admins = normalizeList(value.admins);

  output.trustedUsers = normalizeList(value.trustedUsers);
  output.trustedRoles = normalizeList(value.trustedRoles);
  output.trustedBots = normalizeList(value.trustedBots);

  output.ignoredChannels = normalizeList(value.ignoredChannels);
  output.ignoredRoles = normalizeList(value.ignoredRoles);
  output.ignoredInvites = normalizeList(value.ignoredInvites);
  output.ignoredDomains = normalizeList(value.ignoredDomains);

  output.logChannelId = normalizeId(value.logChannelId);
  output.alertRoleId = normalizeId(value.alertRoleId);
  output.ownerDm = value.ownerDm === true;

  output.quarantineRoleId = normalizeId(value.quarantineRoleId);
  output.verificationRoleId = normalizeId(value.verificationRoleId);
  output.verificationChannelId = normalizeId(value.verificationChannelId);

  output.raidMode = normalizeRaidMode(value.raidMode || {});
  output.join = normalizeJoinConfig(value.join || {});
  output.botRaid = normalizeBotRaidConfig(value.botRaid || {});
  output.message = normalizeMessageConfig(value.message || {});
  output.invite = normalizeInviteConfig(value.invite || {});
  output.webhook = normalizeWebhookConfig(value.webhook || {});

  return output;
}

function createAntiraidPreset(name) {
  const preset = normalizePreset(name);
  const base = normalizeAntiraidConfig(DEFAULT_ANTIRAID);

  if (preset === 'low') {
    base.preset = 'low';
    base.join.limit = 14;
    base.join.windowSeconds = 30;
    base.join.memberRiskThreshold = 65;
    base.join.waveRiskThreshold = 85;
    base.join.punishments.medium = ['alert'];
    base.join.punishments.high = ['verify'];
    base.join.punishments.critical = ['quarantine', 'timeout'];
    base.message.spamLimit = 8;
    base.message.mentionLimit = 12;
    base.raidMode.actions = ['slowmode'];
    return base;
  }

  if (preset === 'strict') {
    base.preset = 'strict';
    base.join.limit = 5;
    base.join.windowSeconds = 20;
    base.join.memberRiskThreshold = 40;
    base.join.waveRiskThreshold = 55;
    base.join.punishments.medium = ['verify'];
    base.join.punishments.high = ['quarantine', 'timeout'];
    base.join.punishments.critical = ['ban'];
    base.message.spamLimit = 4;
    base.message.mentionLimit = 5;
    base.message.linkLimit = 2;
    base.raidMode.actions = ['quarantine', 'slowmode'];
    return base;
  }

  if (preset === 'paranoid') {
    base.preset = 'paranoid';
    base.join.limit = 3;
    base.join.windowSeconds = 15;
    base.join.memberRiskThreshold = 30;
    base.join.waveRiskThreshold = 45;
    base.join.punishments.medium = ['quarantine'];
    base.join.punishments.high = ['quarantine', 'timeout'];
    base.join.punishments.critical = ['ban'];
    base.botRaid.limit = 1;
    base.message.spamLimit = 3;
    base.message.mentionLimit = 4;
    base.message.linkLimit = 1;
    base.raidMode.actions = ['quarantine', 'slowmode', 'lockdown'];
    base.raidMode.lockChannels = true;
    return base;
  }

  base.preset = 'normal';
  return base;
}

function isValidRaidAction(value) {
  return RAID_ACTIONS.includes(value);
}

module.exports = {
  RAID_ACTIONS,
  RAID_SEVERITIES,
  RAID_PRESETS,
  DEFAULT_ANTIRAID,

  normalizeAction,
  normalizeActions,
  normalizeSeverity,
  normalizePreset,
  normalizeAntiraidConfig,
  createAntiraidPreset,
  isValidRaidAction
};