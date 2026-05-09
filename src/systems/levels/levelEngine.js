const { getGuildLevels, updateGuildLevels, addXp } = require('./levelStore');
const { resolveVariables } = require('../variables/variableRegistry');

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function resolveTemplate(template, message, levelData, beforeLevel = 0) {
  const level = Number(levelData.level || 0);
  const xp = Number(levelData.xp || 0);
  const nextLevelXp = 100 + (level + 1) * (level + 1) * 35;
  const progress = nextLevelXp > 0 ? `${Math.min(100, Math.floor((xp / nextLevelXp) * 100))}%` : '0%';
  const rendered = await resolveVariables(String(template || ''), {
    client: message.client,
    message,
    guild: message.guild,
    member: message.member,
    user: message.author,
    channel: message.channel,
    level: {
      new_rank: level,
      old_rank: beforeLevel,
      next_rank: level + 1,
      user_xp: xp,
      user_xp_total: xp,
      xp_needed: Math.max(0, nextLevelXp - xp),
      progress
    },
    args: []
  });

  return rendered
    .replaceAll('{level}', String(level))
    .replaceAll('{xp}', String(xp));
}

async function applyLevelRoles(message, config, level) {
  await syncLevelRolesForMember(message.member, config, level).catch(() => null);
}

function getEligibleLevelEntries(config, level) {
  return Object.entries(config.levelRoles || {})
    .map(([lvl, roleId]) => [Number(lvl), roleId])
    .filter(([lvl]) => Number.isFinite(lvl) && lvl <= level)
    .sort((a, b) => a[0] - b[0]);
}

function getConfiguredRewardRoleIds(config) {
  return [...new Set(Object.values(config.levelRoles || {}).filter(Boolean))];
}

async function syncLevelRolesForMember(member, config, level) {
  const allRewardRoles = getConfiguredRewardRoleIds(config);
  if (!allRewardRoles.length) {
    return {
      changed: false,
      added: 0,
      removed: 0,
      blocked: false
    };
  }

  const eligibleEntries = getEligibleLevelEntries(config, level);
  const desiredRoleIds = config.stackRoles
    ? eligibleEntries.map(([, roleId]) => roleId)
    : eligibleEntries.length
      ? [eligibleEntries[eligibleEntries.length - 1][1]]
      : [];

  const desiredSet = new Set(desiredRoleIds);
  const currentRewardRoleIds = allRewardRoles.filter((roleId) => member.roles.cache.has(roleId));

  if (!config.stackRoles && desiredRoleIds.length) {
    const desiredRole = member.guild.roles.cache.get(desiredRoleIds[0]);
    if (desiredRole && !desiredRole.editable) {
      return {
        changed: false,
        added: 0,
        removed: 0,
        blocked: true,
        blockedRoleId: desiredRole.id
      };
    }
  }

  const toRemove = currentRewardRoleIds.filter((roleId) => {
    const role = member.guild.roles.cache.get(roleId);
    return role?.editable && !desiredSet.has(roleId);
  });

  const toAdd = desiredRoleIds.filter((roleId) => {
    const role = member.guild.roles.cache.get(roleId);
    return role?.editable && !member.roles.cache.has(roleId);
  });

  if (!toAdd.length && !toRemove.length) {
    return {
      changed: false,
      added: 0,
      removed: 0,
      blocked: false
    };
  }

  if (toRemove.length) {
    await member.roles.remove(toRemove);
  }

  if (toAdd.length) {
    await member.roles.add(toAdd);
  }

  return {
    changed: true,
    added: toAdd.length,
    removed: toRemove.length,
    blocked: false
  };
}

async function syncGuildLevelRoles(guild, config = null) {
  const activeConfig = config || await getGuildLevels(guild.id);
  const members = await guild.members.fetch();
  const summary = {
    members: 0,
    updated: 0,
    added: 0,
    removed: 0,
    blocked: 0,
    skippedBots: 0,
    failed: 0
  };

  for (const member of members.values()) {
    if (member.user.bot) {
      summary.skippedBots += 1;
      continue;
    }

    summary.members += 1;

    try {
      const level = Number(activeConfig.users?.[member.id]?.level || 0);
      const result = await syncLevelRolesForMember(member, activeConfig, level);

      if (result.changed) {
        summary.updated += 1;
        summary.added += result.added;
        summary.removed += result.removed;
      }

      if (result.blocked) {
        summary.blocked += 1;
      }
    } catch {
      summary.failed += 1;
    }
  }

  return summary;
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

  const config = await getGuildLevels(message.guild.id);

  if (!config.enabled) return;
  if (config.ignoredChannels.includes(message.channel.id)) return;
  if (message.member.roles.cache.some((role) => config.ignoredRoles.includes(role.id))) return;

  const now = Date.now();

  const user = config.users[message.author.id] || { xp: 0, level: 0, lastXpAt: 0 };

  if (now - Number(user.lastXpAt || 0) < Number(config.cooldownSeconds || 60) * 1000) return;

  const base = randomBetween(Number(config.baseXpMin || 8), Number(config.baseXpMax || 15));
  const amount = Math.max(1, Math.floor(base * getMultiplier(message, config)));

  await updateGuildLevels(message.guild.id, (draft) => {
    draft.users[message.author.id] ||= { xp: 0, level: 0, lastXpAt: 0 };
    draft.users[message.author.id].lastXpAt = now;
  });

  const beforeLevel = user.level || 0;
  const after = await addXp(message.guild.id, message.author.id, amount);

  if (after.leveled && after.level > beforeLevel) {
    await applyLevelRoles(message, await getGuildLevels(message.guild.id), after.level);

    const outputChannel = config.levelChannelId
      ? await message.guild.channels.fetch(config.levelChannelId).catch(() => null)
      : message.channel;

    if (outputChannel?.send) {
      await outputChannel.send({
        content: await resolveTemplate(config.levelMessage, message, after, beforeLevel),
        allowedMentions: { users: [message.author.id], roles: [] }
      }).catch(() => null);
    }
  }
}

module.exports = {
  handleLevelXp,
  syncLevelRolesForMember,
  syncGuildLevelRoles
};
