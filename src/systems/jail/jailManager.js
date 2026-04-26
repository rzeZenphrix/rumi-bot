const db = require('../../services/database');
const { logModerationAction } = require('../logging/auditLog');
const { canManageMember } = require('../../utils/permissions');
const { ensureJailInfrastructure } = require('./roleHandler');

async function jailMember(options) {
  const {
    guild,
    member,
    reason = 'Security quarantine',
    actorId = null,
    metadata = {}
  } = options;

  const settings = await db.getGuildSettings(guild.id);

  if (!settings.jail_enabled) {
    return {
      ok: false,
      reason: 'Jail system is disabled'
    };
  }

  if (!canManageMember(guild, member)) {
    return {
      ok: false,
      reason: 'I cannot manage this member'
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

  const { jailRole } = await ensureJailInfrastructure(guild);

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

  if (!canManageMember(guild, member)) {
    return {
      ok: false,
      reason: 'I cannot manage this member'
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