const { readStore, writeStore } = require('../storage/jsonStore');

function defaultGuild() {
  return {
    enabled: false,
    stackRoles: true,
    levelMessage: 'GG {user.mention}, you reached level {level}!',
    levelChannelId: null,
    baseXpMin: 8,
    baseXpMax: 15,
    cooldownSeconds: 60,
    multiplier: 1,
    channelMultipliers: {},
    roleMultipliers: {},
    ignoredChannels: [],
    ignoredRoles: [],
    levelRoles: {},
    users: {}
  };
}

function getStore() {
  return readStore('levels', { guilds: {} });
}

function saveStore(store) {
  writeStore('levels', store);
}

function getGuildLevels(guildId) {
  const store = getStore();
  store.guilds[guildId] ||= defaultGuild();
  saveStore(store);
  return store.guilds[guildId];
}

function updateGuildLevels(guildId, updater) {
  const store = getStore();
  store.guilds[guildId] ||= defaultGuild();
  updater(store.guilds[guildId]);
  saveStore(store);
  return store.guilds[guildId];
}

function neededXp(level) {
  return 100 + level * level * 35;
}

function ensureUser(config, userId) {
  config.users[userId] ||= {
    xp: 0,
    level: 0,
    lastXpAt: 0
  };

  return config.users[userId];
}

function getUserLevel(guildId, userId) {
  const config = getGuildLevels(guildId);
  return ensureUser(config, userId);
}

function addXp(guildId, userId, amount) {
  let result;

  updateGuildLevels(guildId, (config) => {
    const user = ensureUser(config, userId);
    user.xp += amount;

    let leveled = false;

    while (user.xp >= neededXp(user.level + 1)) {
      user.level += 1;
      leveled = true;
    }

    result = {
      ...user,
      leveled
    };
  });

  return result;
}

module.exports = {
  defaultGuild,
  getGuildLevels,
  updateGuildLevels,
  getUserLevel,
  addXp,
  neededXp
};