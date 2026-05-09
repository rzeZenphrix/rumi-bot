const emojis = require('../../utils/botEmojis');
const db = require('../../services/database');
const logger = require('../logging/logger');

const CUSTOMIZATION_ENABLED = true;
const GUILD_NAMESPACE = 'customization:guild';
const GLOBAL_NAMESPACE = 'customization:global';
const GLOBAL_KEY = 'default';
const DEFAULT_EMBED_HEX = '#c8d8f2';
const ERROR_EMBED_HEX = '#ed4245';

const DEFAULT_REPLY_COLORS = {
  list: DEFAULT_EMBED_HEX,
  info: DEFAULT_EMBED_HEX,
  good: DEFAULT_EMBED_HEX,
  bad: ERROR_EMBED_HEX,
  alert: DEFAULT_EMBED_HEX
};

const DEFAULT_REPLY_EMOJIS = {
  info: emojis.info,
  good: emojis.good,
  bad: emojis.bad,
  list: emojis.info,
  alert: emojis.info
};

const DEFAULT_GLOBAL_CUSTOMIZATION = {
  presence: {
    status: 'online',
    activityType: 'watching',
    activityText: 'over your server'
  },
  stats: {
    enabled: false,
    format: 'Watching {servers} servers'
  }
};

const memoryGuilds = new Map();
let memoryGlobal = { ...DEFAULT_GLOBAL_CUSTOMIZATION };
let hydrated = false;

function isCustomizationEnabled() {
  return CUSTOMIZATION_ENABLED;
}

function disabledMessage() {
  return 'Bot customization is currently unavailable.';
}

function defaultGuildCustomization() {
  return {
    replyMode: 'bot',
    replyColors: { ...DEFAULT_REPLY_COLORS },
    replyEmojis: { ...DEFAULT_REPLY_EMOJIS },
    replyEmbed: {
      title: null,
      footerText: null,
      footerIconUrl: null,
      thumbnailUrl: null,
      imageUrl: null
    },
    botProfile: {
      nickname: null,
      avatarUrl: null,
      bannerUrl: null,
      bio: null
    },
    webhooks: {}
  };
}

function normalizeGuild(config = {}) {
  const base = defaultGuildCustomization();
  const legacyProfile = config.botProfile || {};
  const nickname = legacyProfile.nickname || legacyProfile.username || null;

  return {
    ...base,
    ...config,
    replyColors: {
      ...base.replyColors,
      ...(config.replyColors || {})
    },
    replyEmojis: {
      ...base.replyEmojis,
      ...(config.replyEmojis || {})
    },
    replyEmbed: {
      ...base.replyEmbed,
      ...(config.replyEmbed || {})
    },
    botProfile: {
      ...base.botProfile,
      ...legacyProfile,
      nickname
    },
    webhooks: {
      ...(config.webhooks || {})
    }
  };
}

function normalizeGlobal(config = {}) {
  return {
    ...DEFAULT_GLOBAL_CUSTOMIZATION,
    ...config,
    presence: {
      ...DEFAULT_GLOBAL_CUSTOMIZATION.presence,
      ...(config.presence || {})
    },
    stats: {
      ...DEFAULT_GLOBAL_CUSTOMIZATION.stats,
      ...(config.stats || {})
    }
  };
}

function getSupportInvite() {
  return process.env.SUPPORT_URL || process.env.DISCORD_SUPPORT_URL || 'https://discord.gg/c7jRGDuecN';
}

function appendSupportInvite(bio) {
  const text = String(bio || '').trim();
  if (!text) return null;
  const invite = getSupportInvite();
  if (text.includes(invite)) return text.slice(0, 190);
  return `${text}\n\n${invite}`.slice(0, 190);
}

async function persistGuildCustomization(guildId, config) {
  if (!CUSTOMIZATION_ENABLED || !guildId) return;

  await db.setKv(GUILD_NAMESPACE, guildId, normalizeGuild(config)).catch((error) => {
    logger.warn({ error, guildId }, 'Failed to persist guild customization');
  });
}

async function persistGlobalCustomization(config) {
  if (!CUSTOMIZATION_ENABLED) return;

  await db.setKv(GLOBAL_NAMESPACE, GLOBAL_KEY, normalizeGlobal(config)).catch((error) => {
    logger.warn({ error }, 'Failed to persist global customization');
  });
}

function getGuildCustomization(guildId) {
  return normalizeGuild(memoryGuilds.get(guildId));
}

function updateGuildCustomization(guildId, updater) {
  const current = getGuildCustomization(guildId);
  updater(current);
  const normalized = normalizeGuild(current);
  if (guildId) memoryGuilds.set(guildId, normalized);
  void persistGuildCustomization(guildId, normalized);
  return normalized;
}

async function setGuildCustomization(guildId, updater) {
  const normalized = updateGuildCustomization(guildId, updater);
  await persistGuildCustomization(guildId, normalized);
  return normalized;
}

function getGlobalCustomization() {
  memoryGlobal = normalizeGlobal(memoryGlobal);
  return memoryGlobal;
}

function updateGlobalCustomization(updater) {
  const current = getGlobalCustomization();
  updater(current);
  memoryGlobal = normalizeGlobal(current);
  void persistGlobalCustomization(memoryGlobal);
  return memoryGlobal;
}

async function setGlobalCustomization(updater) {
  const normalized = updateGlobalCustomization(updater);
  await persistGlobalCustomization(normalized);
  return normalized;
}

function setGuildWebhook(guildId, channelId, webhookData) {
  return updateGuildCustomization(guildId, (config) => {
    config.webhooks[channelId] = webhookData;
  });
}

function getGuildWebhook(guildId, channelId) {
  const config = getGuildCustomization(guildId);
  return config.webhooks?.[channelId] || null;
}

function resetGuildCustomization(guildId, section = 'all') {
  const defaults = defaultGuildCustomization();

  return updateGuildCustomization(guildId, (config) => {
    if (section === 'all') {
      Object.assign(config, defaults);
      return;
    }

    if (section === 'theme') {
      config.replyColors = defaults.replyColors;
      config.replyEmojis = defaults.replyEmojis;
      return;
    }

    if (section === 'profile') {
      config.botProfile = defaults.botProfile;
      config.replyMode = defaults.replyMode;
      return;
    }

    if (section === 'webhooks') {
      config.webhooks = {};
    }
  });
}

async function hydrateCustomizationStore(client) {
  if (!CUSTOMIZATION_ENABLED || hydrated) return;

  try {
    const global = await db.getKv(GLOBAL_NAMESPACE, GLOBAL_KEY, DEFAULT_GLOBAL_CUSTOMIZATION);
    memoryGlobal = normalizeGlobal(global);

    const guildIds = [...(client?.guilds?.cache?.keys?.() || [])];
    await Promise.all(guildIds.map(async (guildId) => {
      const config = await db.getKv(GUILD_NAMESPACE, guildId, null).catch(() => null);
      if (config) memoryGuilds.set(guildId, normalizeGuild(config));
    }));

    hydrated = true;
  } catch (error) {
    logger.warn({ error }, 'Customization hydration failed; defaults will be used until settings are saved again.');
  }
}

function hexToInt(hex, fallback = 0x5865f2) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;
  return Number.parseInt(clean, 16);
}

function normalizeHex(hex) {
  const clean = String(hex || '').replace('#', '').trim();
  if (!/^[0-9a-f]{6}$/i.test(clean)) return null;
  return `#${clean.toLowerCase()}`;
}

module.exports = {
  CUSTOMIZATION_ENABLED,
  DEFAULT_REPLY_COLORS,
  DEFAULT_REPLY_EMOJIS,
  defaultGuildCustomization,
  isCustomizationEnabled,
  disabledMessage,
  getGuildCustomization,
  updateGuildCustomization,
  setGuildCustomization,
  getGlobalCustomization,
  updateGlobalCustomization,
  setGlobalCustomization,
  getGuildWebhook,
  setGuildWebhook,
  resetGuildCustomization,
  hydrateCustomizationStore,
  appendSupportInvite,
  getSupportInvite,
  hexToInt,
  normalizeHex
};
