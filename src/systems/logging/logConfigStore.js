const db = require('../../services/database');

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
  'antinukeAction',
  'automodAction'
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

async function getGuildLogConfig(guildId) {
  const row = await db.getKv('logging:config', guildId, null);
  return normalizeConfig(row);
}

async function updateGuildLogConfig(guildId, updater) {
  const current = await getGuildLogConfig(guildId);
  updater(current);
  const normalized = normalizeConfig(current);
  await db.setKv('logging:config', guildId, normalized);
  return normalized;
}

module.exports = {
  DEFAULT_EVENTS,
  getGuildLogConfig,
  updateGuildLogConfig
};
