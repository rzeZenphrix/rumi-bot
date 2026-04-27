const db = require('../../services/database');

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

async function getGuildLevels(guildId) {
  const config = await db.getKv('levels:guilds', guildId, defaultGuild());
  config.users ||= {};
  return {
    ...defaultGuild(),
    ...config,
    users: config.users || {}
  };
}

async function updateGuildLevels(guildId, updater) {
  const config = await getGuildLevels(guildId);
  updater(config);
  await db.setKv('levels:guilds', guildId, config);
  return config;
}

async function getUserLevel(guildId, userId) {
  const config = await getGuildLevels(guildId);
  return ensureUser(config, userId);
}

async function addXp(guildId, userId, amount) {
  let result;

  await updateGuildLevels(guildId, (config) => {
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
