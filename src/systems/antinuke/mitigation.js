const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const logger = require('../logging/logger');
const { manageabilityState, moderatabilityState } = require('../../utils/permissions');
const { staffStripMember } = require('../staff/staffManager');
const { normalizePunishments } = require('./actionTypes');

let lockdownGuild = null;

try {
  ({ lockdownGuild } = require('../security/lockdownManager'));
} catch (_error) {
  lockdownGuild = null;
}

const DANGEROUS_PERMISSIONS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageGuildExpressions
].filter(Boolean);

function hasDangerousPermissions(role) {
  return DANGEROUS_PERMISSIONS.some((permission) => role.permissions.has(permission));
}

function canPunishMember(guild, member) {
  if (!guild || !member) {
    return {
      ok: false,
      reason: 'Member could not be resolved.'
    };
  }

  if (member.id === guild.ownerId) {
    return {
      ok: false,
      reason: 'Server owner cannot be punished.'
    };
  }

  if (member.id === guild.client.user.id) {
    return {
      ok: false,
      reason: 'Rumi cannot punish itself.'
    };
  }

  return {
    ok: true,
    reason: null
  };
}

async function stripDangerousRoles(member, reason = 'Anti-nuke mitigation') {
  const removed = [];
  const failed = [];
  const skipped = [];

  const roles = member.roles.cache.filter((role) => {
    if (role.id === member.guild.id) return false;
    if (role.managed) return false;
    return hasDangerousPermissions(role);
  });

  for (const role of roles.values()) {
    if (!role.editable) {
      failed.push({
        roleId: role.id,
        roleName: role.name,
        reason: 'Rumi cannot manage this role due to hierarchy or permissions.'
      });
      continue;
    }

    try {
      await member.roles.remove(role, reason);

      removed.push({
        roleId: role.id,
        roleName: role.name
      });
    } catch (error) {
      failed.push({
        roleId: role.id,
        roleName: role.name,
        reason: error.message
      });
    }
  }

  return {
    ok: failed.length === 0,
    removed,
    failed,
    skipped
  };
}

async function applyAlert() {
  return {
    ok: true,
    type: 'alert',
    details: 'Alert only. No direct punishment applied.'
  };
}

async function applyStaffStrip(member, reason) {
  const result = await staffStripMember(member, {
    reason
  });

  return {
    ok: result.ok,
    type: 'staff_strip',
    details: `Removed ${result.removed.length} staff role(s).`,
    result
  };
}

async function applyStrip(member, reason) {
  const result = await stripDangerousRoles(member, reason);

  return {
    ok: result.ok,
    type: 'strip',
    details: `Removed ${result.removed.length} dangerous role(s).`,
    result
  };
}

async function applyTimeout(guild, member, config, reason, severe = false) {
  const safety = moderatabilityState(guild, member);

  if (!safety.ok) {
    return {
      ok: false,
      type: 'timeout',
      details: safety.reason
    };
  }

  const duration = severe
    ? config.severeTimeoutMs || config.timeoutMs
    : config.timeoutMs;

  try {
    await member.timeout(duration, reason);

    return {
      ok: true,
      type: 'timeout',
      details: `Timed out for ${Math.round(duration / 60000)} minute(s).`,
      durationMs: duration
    };
  } catch (error) {
    return {
      ok: false,
      type: 'timeout',
      details: error.message
    };
  }
}

async function applyKick(guild, member, reason) {
  const safety = manageabilityState(guild, member);

  if (!safety.ok) {
    return {
      ok: false,
      type: 'kick',
      details: safety.reason
    };
  }

  try {
    await member.kick(reason);

    return {
      ok: true,
      type: 'kick',
      details: 'Kicked executor.'
    };
  } catch (error) {
    return {
      ok: false,
      type: 'kick',
      details: error.message
    };
  }
}

async function applyBan(guild, member, reason) {
  const safety = manageabilityState(guild, member);

  if (!safety.ok) {
    return {
      ok: false,
      type: 'ban',
      details: safety.reason
    };
  }

  try {
    await member.ban({
      reason
    });

    return {
      ok: true,
      type: 'ban',
      details: 'Banned executor.'
    };
  } catch (error) {
    return {
      ok: false,
      type: 'ban',
      details: error.message
    };
  }
}

async function applyJail(guild, member, config, reason) {
  const jailRoleId = config.jailRoleId || config.jail?.roleId;

  if (!jailRoleId) {
    return {
      ok: false,
      type: 'jail',
      details: 'No jail role is configured.'
    };
  }

  const jailRole = guild.roles.cache.get(jailRoleId);

  if (!jailRole) {
    return {
      ok: false,
      type: 'jail',
      details: 'Configured jail role no longer exists.'
    };
  }

  if (!jailRole.editable) {
    return {
      ok: false,
      type: 'jail',
      details: 'Rumi cannot manage the jail role due to hierarchy.'
    };
  }

  const previousRoleIds = member.roles.cache
    .filter((role) => role.id !== guild.id && !role.managed)
    .map((role) => role.id);

  try {
    if (typeof db.createJailRecord === 'function') {
      await db.createJailRecord({
        guild_id: guild.id,
        user_id: member.id,
        jailed_by: guild.client.user.id,
        reason,
        previous_role_ids: previousRoleIds
      }).catch(() => null);
    }

    await member.roles.set([jailRole.id], reason);

    return {
      ok: true,
      type: 'jail',
      details: 'Moved executor to jail role.',
      previousRoleIds
    };
  } catch (error) {
    return {
      ok: false,
      type: 'jail',
      details: error.message
    };
  }
}

async function applyLockdown(guild, actorId, reason) {
  if (typeof lockdownGuild !== 'function') {
    return {
      ok: false,
      type: 'lockdown',
      details: 'Lockdown manager is not available.'
    };
  }

  try {
    const result = await lockdownGuild({
      guild,
      reason,
      actorId
    });

    return {
      ok: result.ok,
      type: 'lockdown',
      details: result.ok
        ? `Locked ${result.channelCount || 0} channel(s).`
        : result.reason || 'Lockdown failed.',
      result
    };
  } catch (error) {
    return {
      ok: false,
      type: 'lockdown',
      details: error.message
    };
  }
}

function getPunishmentChain(config = {}, actionConfig = {}) {
  const actionPunishments = normalizePunishments(actionConfig.punishments || actionConfig.punishment);

  if (actionPunishments.length) return actionPunishments;

  const defaultPunishments = normalizePunishments(config.defaultPunishments || config.punishments);

  if (defaultPunishments.length) return defaultPunishments;

  const legacyPunishment = normalizePunishments(config.punishment);

  if (legacyPunishment.length) return legacyPunishment;

  return ['staff_strip', 'strip', 'timeout'];
}

async function executePunishment(options) {
  const {
    guild,
    executor,
    config = {},
    actionConfig = {},
    actionType = 'unknown',
    score = 0,
    severe = false,
    reason = null
  } = options;

  const member = await guild.members.fetch(executor.id).catch(() => null);

  if (!member) {
    return [{
      ok: false,
      type: 'resolve_member',
      details: 'Executor is no longer in the server.'
    }];
  }

  const safety = canPunishMember(guild, member);

  if (!safety.ok) {
    return [{
      ok: false,
      type: 'safety',
      details: safety.reason
    }];
  }

  const chain = getPunishmentChain(config, actionConfig);
  const finalReason = reason || `Anti-nuke: ${actionType} triggered. Score: ${score}`;
  const results = [];

  for (const punishment of chain) {
    if (punishment === 'none') {
      results.push({
        ok: true,
        type: 'none',
        details: 'No punishment configured.'
      });
      continue;
    }

    if (punishment === 'alert') {
      results.push(await applyAlert());
      continue;
    }

    if (punishment === 'staff_strip') {
      results.push(await applyStaffStrip(member, finalReason));
      continue;
    }

    if (punishment === 'strip') {
      results.push(await applyStrip(member, finalReason));
      continue;
    }

    if (punishment === 'timeout') {
      results.push(await applyTimeout(guild, member, config, finalReason, severe));
      continue;
    }

    if (punishment === 'kick') {
      results.push(await applyKick(guild, member, finalReason));
      continue;
    }

    if (punishment === 'ban') {
      results.push(await applyBan(guild, member, finalReason));
      continue;
    }

    if (punishment === 'jail') {
      results.push(await applyJail(guild, member, config, finalReason));
      continue;
    }

    if (punishment === 'lockdown') {
      results.push(await applyLockdown(guild, executor.id, finalReason));
      continue;
    }

    results.push({
      ok: false,
      type: punishment,
      details: 'Unknown punishment type.'
    });
  }

  if (typeof db.insertPunishmentLog === 'function') {
    await db.insertPunishmentLog({
      guild_id: guild.id,
      user_id: executor.id,
      moderator_id: guild.client.user.id,
      bot_action: true,
      action_type: 'antinuke_mitigation',
      reason: finalReason,
      metadata: {
        actionType,
        score,
        severe,
        punishments: chain,
        results
      }
    }).catch((error) => {
      logger.warn(
        {
          error,
          guildId: guild.id,
          executorId: executor.id
        },
        'Could not insert anti-nuke punishment log'
      );
    });
  }

  return results;
}

module.exports = {
  getPunishmentChain,
  executePunishment,
  stripDangerousRoles,
  canPunishMember
};