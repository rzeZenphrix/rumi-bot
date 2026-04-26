const db = require('../database/db');
const emojis = require('../../config/botEmojis');

const memoryKv = new Map();

const DEFAULT_REPLY_COLORS = {
  list: '#2b2d31',
  info: '#5865f2',
  good: '#57f287',
  bad: '#ed4245',
  alert: '#fee75c'
};

const DEFAULT_REPLY_EMOJIS = {
  list: emojis.list,
  info: emojis.info,
  good: emojis.good,
  bad: emojis.bad,
  alert: emojis.alert
};

const DEFAULT_GLOBAL_CUSTOMIZATION = {
  presence: {
    enabled: true,
    status: 'online',
    activityType: 'Watching',
    activityText: 'over the server'
  }
};

function defaultGuildCustomization() {
  return {
    replyMode: 'bot',

    replyColors: {
      ...DEFAULT_REPLY_COLORS
    },

    replyEmojis: {
      ...DEFAULT_REPLY_EMOJIS
    },

    botProfile: {
      username: null,
      avatarUrl: null,
      bannerUrl: null,
      bio: null
    },

    webhooks: {}
  };
}

function normalizeGuild(config = {}) {
  const base = defaultGuildCustomization();

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

    botProfile: {
      ...base.botProfile,
      ...(config.botProfile || {})
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
    }
  };
}

async function ensureTables() {
  if (!db.hasDatabaseConfigured()) return false;

  await db.exec(`
    create table if not exists bot_kv (
      key text primary key,
      value jsonb not null default '{}'::jsonb,
      updated_at timestamptz not null default now()
    );
  `);

  return true;
}

async function getKv(key, fallback) {
  const ready = await ensureTables();

  if (!ready) {
    return memoryKv.has(key) ? memoryKv.get(key) : fallback;
  }

  const row = await db.one(
    'select value from bot_kv where key = $1 limit 1',
    [key]
  );

  return row?.value ?? fallback;
}

async function setKv(key, value) {
  memoryKv.set(key, value);

  const ready = await ensureTables();

  if (!ready) return value;

  await db.exec(
    `
    insert into bot_kv (key, value, updated_at)
    values ($1, $2::jsonb, now())
    on conflict (key)
    do update set value = excluded.value, updated_at = now()
    `,
    [key, JSON.stringify(value)]
  );

  return value;
}

async function getGuildCustomization(guildId) {
  const key = `guild:${guildId}:customization`;
  const raw = await getKv(key, defaultGuildCustomization());
  const normalized = normalizeGuild(raw);

  await setKv(key, normalized);

  return normalized;
}

async function updateGuildCustomization(guildId, updater) {
  const current = await getGuildCustomization(guildId);

  await updater(current);

  const normalized = normalizeGuild(current);

  await setKv(`guild:${guildId}:customization`, normalized);

  return normalized;
}

async function getGlobalCustomization() {
  const raw = await getKv('global:customization', DEFAULT_GLOBAL_CUSTOMIZATION);
  const normalized = normalizeGlobal(raw);

  await setKv('global:customization', normalized);

  return normalized;
}

async function updateGlobalCustomization(updater) {
  const current = await getGlobalCustomization();

  await updater(current);

  const normalized = normalizeGlobal(current);

  await setKv('global:customization', normalized);

  return normalized;
}

async function setGuildWebhook(guildId, channelId, webhookData) {
  return updateGuildCustomization(guildId, (config) => {
    config.webhooks[channelId] = webhookData;
  });
}

async function getGuildWebhook(guildId, channelId) {
  const config = await getGuildCustomization(guildId);
  return config.webhooks?.[channelId] || null;
}

async function resetGuildCustomization(guildId, section = 'all') {
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

function hexToInt(hex, fallback = 0x5865f2) {
  const clean = String(hex || '').replace('#', '').trim();

  if (!/^[0-9a-f]{6}$/i.test(clean)) {
    return fallback;
  }

  return Number.parseInt(clean, 16);
}

function normalizeHex(hex) {
  const clean = String(hex || '').replace('#', '').trim();

  if (!/^[0-9a-f]{6}$/i.test(clean)) {
    return null;
  }

  return `#${clean.toLowerCase()}`;
}

module.exports = {
  DEFAULT_REPLY_COLORS,
  DEFAULT_REPLY_EMOJIS,
  defaultGuildCustomization,
  getGuildCustomization,
  updateGuildCustomization,
  getGlobalCustomization,
  updateGlobalCustomization,
  getGuildWebhook,
  setGuildWebhook,
  resetGuildCustomization,
  hexToInt,
  normalizeHex
};