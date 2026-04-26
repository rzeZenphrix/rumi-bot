const { readStore, writeStore } = require('../storage/jsonStore');

const DEFAULT = {
  enabled: false,
  punishment: 'strip',
  whitelist: [],
  thresholds: {
    channelDelete: 3,
    roleDelete: 3,
    banAdd: 6,
    webhookCreate: 5,
    windowMs: 30000
  }
};

function getStore() {
  return readStore('antinuke', { guilds: {} });
}

function saveStore(store) {
  return writeStore('antinuke', store);
}

function getConfig(guildId) {
  const store = getStore();
  store.guilds[guildId] ||= JSON.parse(JSON.stringify(DEFAULT));
  saveStore(store);
  return store.guilds[guildId];
}

function updateConfig(guildId, updater) {
  const store = getStore();
  store.guilds[guildId] ||= JSON.parse(JSON.stringify(DEFAULT));
  updater(store.guilds[guildId]);
  saveStore(store);
  return store.guilds[guildId];
}

module.exports = { DEFAULT, getConfig, updateConfig };
