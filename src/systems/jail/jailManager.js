const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const { logModerationAction } = require('../logging/auditLog');
const { manageabilityState } = require('../../utils/permissions');
const { getProtectionSettings, isSecuritySystemEnabled } = require('../security/protectionConfig');

async function getJailSetupState(guild, settings) {
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    return {
      ok: false,
      reason: 'I could not resolve my own member record in this server.',
      reasonCode: 'member_unavailable'
    };
  }

  if (!settings.jail_role_id) {
    return {
      ok: false,
      reason: 'Jail is not set up yet. Run `jailsetup` before enabling AutoJail enforcement.',
      reasonCode: 'setup_required'
    };
  }

  const jailRole = guild.roles.cache.get(settings.jail_role_id) || await guild.roles.fetch(settings.jail_role_id).catch(() => null);
  if (!jailRole) {
    return {
      ok: false,
      reason: 'The configured jail role no longer exists. Run `jailsetup` again.',
      reasonCode: 'setup_required'
    };
  }

  if (!settings.jail_channel_id) {
    return {
      ok: false,
      reason: 'The jail channel is not configured yet. Run `jailsetup` before using AutoJail.',
      reasonCode: 'setup_required'
    };
  }

  const jailChannel = guild.channels.cache.get(settings.jail_channel_id) || await guild.channels.fetch(settings.jail_channel_id).catch(() => null);
  if (!jailChannel) {
    return {
      ok: false,
      reason: 'The configured jail channel no longer exists. Run `jailsetup` again.',
      reasonCode: 'setup_required'
    };
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    return {
      ok: false,
      reason: 'I need Manage Roles to apply the jail role.',
      reasonCode: 'missing_permissions'
    };
  }

  if (!jailRole.editable) {
    return {
      ok: false,
      reason: 'The jail role is above me in the role list, so I cannot assign it.',
      reasonCode: 'missing_permissions'
    };
  }

  return {
    ok: true,
    jailRole,
    jailChannel
  };
}

async function jailMember(options) {
  const {
    guild,
    member,
    reason = 'Security quarantine',
    actorId = null,
    metadata = {}
  } = options;

  const settings = await db.getGuildSettings(guild.id);
  const protection = await getProtectionSettings(guild.id).catch(() => null);

  if (!settings.jail_enabled || (protection && !isSecuritySystemEnabled(protection, 'autojail', settings.jail_enabled !== false))) {
    return {
      ok: false,
      reason: 'Jail system is disabled',
      reasonCode: 'disabled'
    };
  }

  const jailState = await getJailSetupState(guild, settings);
  if (!jailState.ok) {
    return {
      ok: false,
      reason: jailState.reason,
      reasonCode: jailState.reasonCode
    };
  }

  const manageState = manageabilityState(guild, member);
  if (!manageState.ok) {
    return {
      ok: false,
      reason: manageState.reason,
      reasonCode: 'manageability'
    };
  }

  const existing = await db.getActiveJailRecord(guild.id, member.id);

  if (existing) {
    return {
      ok: true,
      alreadyJailed: true,
      record: existing
    };
  }

  const { jailRole } = jailState;

  const previousRoleIds = member.roles.cache
    .filter((role) => role.id !== guild.id && role.id !== jailRole.id)
    .map((role) => role.id);

  const removableRoles = member.roles.cache.filter((role) => {
    return (
      role.id !== guild.id &&
      role.id !== jailRole.id &&
      !role.managed &&
      role.editable
    );
  });

  if (removableRoles.size) {
    await member.roles.remove([...removableRoles.values()], reason);
  }

  await member.roles.add(jailRole, reason);

  const record = await db.createJailRecord({
    guild_id: guild.id,
    user_id: member.id,
    jailed_by: actorId,
    reason,
    previous_role_ids: previousRoleIds,
    active: true
  });

  await logModerationAction({
    guildId: guild.id,
    userId: member.id,
    moderatorId: actorId,
    botAction: !actorId,
    actionType: 'jail',
    reason,
    metadata: {
      ...metadata,
      previousRoleIds,
      removedRoleIds: removableRoles.map((role) => role.id)
    }
  });

  return {
    ok: true,
    record
  };
}

async function unjailMember(options) {
  const {
    guild,
    member,
    reason = 'Quarantine lifted',
    actorId = null
  } = options;

  const settings = await db.getGuildSettings(guild.id);
  const record = await db.getActiveJailRecord(guild.id, member.id);

  if (!record) {
    return {
      ok: false,
      reason: 'I do not have an active jail record for that member'
    };
  }

  const manageState = manageabilityState(guild, member);
  if (!manageState.ok) {
    return {
      ok: false,
      reason: manageState.reason
    };
  }

  if (settings.jail_role_id && member.roles.cache.has(settings.jail_role_id)) {
    await member.roles.remove(settings.jail_role_id, reason).catch(() => null);
  }

  const restorableRoles = (record.previous_role_ids || [])
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter((role) => role && !role.managed && role.editable);

  if (restorableRoles.length) {
    await member.roles.add(restorableRoles, reason).catch(() => null);
  }

  await db.releaseJailRecord(guild.id, member.id);

  await logModerationAction({
    guildId: guild.id,
    userId: member.id,
    moderatorId: actorId,
    botAction: !actorId,
    actionType: 'unjail',
    reason,
    metadata: {
      restoredRoleIds: restorableRoles.map((role) => role.id)
    }
  });

  return {
    ok: true
  };
}

module.exports = {
  jailMember,
  unjailMember
};
