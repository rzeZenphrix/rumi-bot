const { getGuildLevels, updateGuildLevels, addXp } = require('./levelStore');

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function resolveTemplate(template, message, levelData) {
  return String(template || '')
    .replaceAll('{user}', message.author.username)
    .replaceAll('{user.mention}', `<@${message.author.id}>`)
    .replaceAll('{level}', String(levelData.level))
    .replaceAll('{xp}', String(levelData.xp))
    .replaceAll('{guild.name}', message.guild.name);
}

async function applyLevelRoles(message, config, level) {
  const entries = Object.entries(config.levelRoles || {})
    .map(([lvl, roleId]) => [Number(lvl), roleId])
    .filter(([lvl]) => lvl <= level)
    .sort((a, b) => a[0] - b[0]);

  if (!entries.length) return;

  const member = message.member;

  if (config.stackRoles) {
    for (const [, roleId] of entries) {
      await member.roles.add(roleId).catch(() => null);
    }

    return;
  }

  const latest = entries[entries.length - 1][1];
  const allRewardRoles = Object.values(config.levelRoles || {});

  await member.roles.remove(allRewardRoles.filter((id) => id !== latest)).catch(() => null);
  await member.roles.add(latest).catch(() => null);
}

function getMultiplier(message, config) {
  let multiplier = Number(config.multiplier || 1);

  if (config.channelMultipliers?.[message.channel.id]) {
    multiplier *= Number(config.channelMultipliers[message.channel.id] || 1);
  }

  for (const role of message.member.roles.cache.values()) {
    if (config.roleMultipliers?.[role.id]) {
      multiplier *= Number(config.roleMultipliers[role.id] || 1);
    }
  }

  return multiplier;
}

async function handleLevelXp(client, message) {
  if (!message.guild || message.author.bot) return;

  const config = getGuildLevels(message.guild.id);

  if (!config.enabled) return;
  if (config.ignoredChannels.includes(message.channel.id)) return;
  if (message.member.roles.cache.some((role) => config.ignoredRoles.includes(role.id))) return;

  const now = Date.now();

  const user = config.users[message.author.id] || { xp: 0, level: 0, lastXpAt: 0 };

  if (now - Number(user.lastXpAt || 0) < Number(config.cooldownSeconds || 60) * 1000) return;

  const base = randomBetween(Number(config.baseXpMin || 8), Number(config.baseXpMax || 15));
  const amount = Math.max(1, Math.floor(base * getMultiplier(message, config)));

  updateGuildLevels(message.guild.id, (draft) => {
    draft.users[message.author.id] ||= { xp: 0, level: 0, lastXpAt: 0 };
    draft.users[message.author.id].lastXpAt = now;
  });

  const beforeLevel = user.level || 0;
  const after = addXp(message.guild.id, message.author.id, amount);

  if (after.leveled && after.level > beforeLevel) {
    await applyLevelRoles(message, getGuildLevels(message.guild.id), after.level);

    const outputChannel = config.levelChannelId
      ? await message.guild.channels.fetch(config.levelChannelId).catch(() => null)
      : message.channel;

    if (outputChannel?.send) {
      await outputChannel.send({
        content: resolveTemplate(config.levelMessage, message, after),
        allowedMentions: { users: [message.author.id], roles: [] }
      }).catch(() => null);
    }
  }
}

module.exports = {
  handleLevelXp
};