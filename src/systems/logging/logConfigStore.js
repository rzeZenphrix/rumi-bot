const { readStore, writeStore } = require('../storage/jsonStore');

const DEFAULT_EVENTS = [
  'all',
  'messageDelete',
  'messageUpdate',
  'messageBulkDelete',
  'memberJoin',
  'memberLeave',
  'memberUpdate',
  'memberBan',
  'memberUnban',
  'roleCreate',
  'roleDelete',
  'roleUpdate',
  'channelCreate',
  'channelDelete',
  'channelUpdate',
  'emojiCreate',
  'emojiDelete',
  'emojiUpdate',
  'stickerCreate',
  'stickerDelete',
  'stickerUpdate',
  'inviteCreate',
  'inviteDelete',
  'webhookUpdate',
  'guildUpdate',
  'threadCreate',
  'threadDelete',
  'threadUpdate',
  'voiceStateUpdate',
  'hardbanReapply',
  'antinukeAction'
];

function defaultGuildConfig() {
  return {
    enabled: false,
    channels: {},
    webhooks: {},
    ignores: {
      channels: [],
      users: [],
      roles: []
    },
    colors: {}
  };
}

function normalizeConfig(config) {
  const base = defaultGuildConfig();
  const output = { ...base, ...(config || {}) };

  output.channels ||= {};
  output.webhooks ||= {};
  output.colors ||= {};
  output.ignores ||= {};
  output.ignores.channels ||= [];
  output.ignores.users ||= [];
  output.ignores.roles ||= [];

  return output;
}

function getAll() {
  return readStore('logConfig', { guilds: {} });
}

function saveAll(store) {
  return writeStore('logConfig', store);
}

function getGuildLogConfig(guildId) {
  const store = getAll();
  store.guilds[guildId] = normalizeConfig(store.guilds[guildId]);
  saveAll(store);
  return store.guilds[guildId];
}

function updateGuildLogConfig(guildId, updater) {
  const store = getAll();
  store.guilds[guildId] = normalizeConfig(store.guilds[guildId]);
  updater(store.guilds[guildId]);
  store.guilds[guildId] = normalizeConfig(store.guilds[guildId]);
  saveAll(store);
  return store.guilds[guildId];
}

module.exports = {
  DEFAULT_EVENTS,
  getGuildLogConfig,
  updateGuildLogConfig
};