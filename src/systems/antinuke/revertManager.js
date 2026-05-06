const logger = require('../logging/logger');

function rollbackAllowed(config, actionConfig) {
  const global = config.rollback || {};
  if (global.enabled === false) return 'off';

  return actionConfig.rollback || global.mode || 'off';
}

function serializePermissionOverwrites(channel) {
  return [...(channel.permissionOverwrites?.cache?.values?.() || [])].map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield,
    deny: overwrite.deny.bitfield
  }));
}

async function tryDelete(target, reason, actionName) {
  if (!target?.delete) {
    return {
      ok: false,
      action: actionName,
      detail: 'Target object is unavailable or cannot be deleted.'
    };
  }

  if ('editable' in target && target.editable === false) {
    return {
      ok: false,
      action: actionName,
      detail: 'Rumi cannot manage this object due to hierarchy or permissions.'
    };
  }

  try {
    await target.delete(reason);

    return {
      ok: true,
      action: actionName,
      detail: 'Deleted suspicious created object.'
    };
  } catch (error) {
    return {
      ok: false,
      action: actionName,
      detail: error.message
    };
  }
}

async function rollbackDeletedChannel(guild, oldChannel) {
  if (!guild || !oldChannel) {
    return {
      ok: false,
      action: 'recreate_deleted_channel',
      detail: 'Deleted channel snapshot is unavailable.'
    };
  }

  const data = {
    name: oldChannel.name || 'restored-channel',
    type: oldChannel.type,
    reason: 'Anti-nuke rollback: channel deletion',
    permissionOverwrites: serializePermissionOverwrites(oldChannel)
  };

  if (oldChannel.parentId) data.parent = oldChannel.parentId;
  if (oldChannel.topic !== undefined) data.topic = oldChannel.topic;
  if (oldChannel.nsfw !== undefined) data.nsfw = oldChannel.nsfw;
  if (oldChannel.rateLimitPerUser !== undefined) data.rateLimitPerUser = oldChannel.rateLimitPerUser;
  if (oldChannel.bitrate !== undefined) data.bitrate = oldChannel.bitrate;
  if (oldChannel.userLimit !== undefined) data.userLimit = oldChannel.userLimit;

  try {
    const restored = await guild.channels.create(data);

    if (Number.isFinite(oldChannel.rawPosition)) {
      await restored.setPosition(oldChannel.rawPosition).catch(() => null);
    }

    return {
      ok: true,
      action: 'recreate_deleted_channel',
      detail: `Recreated deleted channel as #${restored.name}.`,
      restoredChannelId: restored.id
    };
  } catch (error) {
    return {
      ok: false,
      action: 'recreate_deleted_channel',
      detail: error.message
    };
  }
}

async function rollbackDeletedRole(guild, oldRole) {
  if (!guild || !oldRole) {
    return {
      ok: false,
      action: 'recreate_deleted_role',
      detail: 'Deleted role snapshot is unavailable.'
    };
  }

  try {
    const restored = await guild.roles.create({
      name: oldRole.name,
      color: oldRole.color,
      hoist: oldRole.hoist,
      mentionable: oldRole.mentionable,
      permissions: oldRole.permissions,
      reason: 'Anti-nuke rollback: role deletion'
    });

    if (Number.isFinite(oldRole.position)) {
      await restored.setPosition(oldRole.position).catch(() => null);
    }

    return {
      ok: true,
      action: 'recreate_deleted_role',
      detail: `Recreated deleted role ${restored.name}.`,
      restoredRoleId: restored.id
    };
  } catch (error) {
    return {
      ok: false,
      action: 'recreate_deleted_role',
      detail: error.message
    };
  }
}

async function rollbackCreatedChannel(target) {
  return tryDelete(target, 'Anti-nuke rollback: suspicious channel creation', 'delete_created_channel');
}

async function rollbackCreatedRole(target) {
  return tryDelete(target, 'Anti-nuke rollback: suspicious role creation', 'delete_created_role');
}

async function rollbackCreatedEmoji(target) {
  return tryDelete(target, 'Anti-nuke rollback: suspicious emoji creation', 'delete_created_emoji');
}

async function rollbackCreatedSticker(target) {
  return tryDelete(target, 'Anti-nuke rollback: suspicious sticker creation', 'delete_created_sticker');
}

async function rollbackInviteCreate(target) {
  return tryDelete(target, 'Anti-nuke rollback: suspicious invite creation', 'delete_created_invite');
}

async function rollbackRoleUpdate(oldRole, newRole) {
  if (!oldRole || !newRole) {
    return {
      ok: false,
      action: 'restore_role_update',
      detail: 'Old or new role object is unavailable.'
    };
  }

  if (!newRole.editable) {
    return {
      ok: false,
      action: 'restore_role_update',
      detail: 'Rumi cannot edit this role due to hierarchy.'
    };
  }

  try {
    await newRole.edit({
      name: oldRole.name,
      color: oldRole.color,
      hoist: oldRole.hoist,
      mentionable: oldRole.mentionable,
      permissions: oldRole.permissions
    }, 'Anti-nuke rollback: role update');

    return {
      ok: true,
      action: 'restore_role_update',
      detail: 'Restored role settings.'
    };
  } catch (error) {
    return {
      ok: false,
      action: 'restore_role_update',
      detail: error.message
    };
  }
}

async function rollbackChannelUpdate(oldChannel, newChannel) {
  if (!oldChannel || !newChannel?.edit) {
    return {
      ok: false,
      action: 'restore_channel_update',
      detail: 'Old or new channel object is unavailable.'
    };
  }

  const patch = {};

  if ('name' in newChannel) patch.name = oldChannel.name;
  if ('topic' in newChannel && oldChannel.topic !== undefined) patch.topic = oldChannel.topic;
  if ('nsfw' in newChannel && oldChannel.nsfw !== undefined) patch.nsfw = oldChannel.nsfw;
  if ('rateLimitPerUser' in newChannel && oldChannel.rateLimitPerUser !== undefined) {
    patch.rateLimitPerUser = oldChannel.rateLimitPerUser;
  }
  if ('parentId' in newChannel && oldChannel.parentId !== undefined) {
    patch.parent = oldChannel.parentId;
  }

  try {
    await newChannel.edit(patch, 'Anti-nuke rollback: channel update');

    if (oldChannel.permissionOverwrites?.cache && newChannel.permissionOverwrites?.set) {
      await newChannel.permissionOverwrites.set(
        [...oldChannel.permissionOverwrites.cache.values()],
        'Anti-nuke rollback: permission overwrites'
      ).catch(() => null);
    }

    return {
      ok: true,
      action: 'restore_channel_update',
      detail: 'Restored channel settings where possible.'
    };
  } catch (error) {
    return {
      ok: false,
      action: 'restore_channel_update',
      detail: error.message
    };
  }
}

async function rollbackEmojiUpdate(oldEmoji, newEmoji) {
  if (!oldEmoji || !newEmoji?.edit) {
    return {
      ok: false,
      action: 'restore_emoji_update',
      detail: 'Old or new emoji object is unavailable.'
    };
  }

  try {
    await newEmoji.edit({
      name: oldEmoji.name
    }, 'Anti-nuke rollback: emoji update');

    return {
      ok: true,
      action: 'restore_emoji_update',
      detail: 'Restored emoji name.'
    };
  } catch (error) {
    return {
      ok: false,
      action: 'restore_emoji_update',
      detail: error.message
    };
  }
}

async function rollbackStickerUpdate(oldSticker, newSticker) {
  if (!oldSticker || !newSticker?.edit) {
    return {
      ok: false,
      action: 'restore_sticker_update',
      detail: 'Old or new sticker object is unavailable.'
    };
  }

  try {
    await newSticker.edit({
      name: oldSticker.name,
      description: oldSticker.description,
      tags: oldSticker.tags
    }, 'Anti-nuke rollback: sticker update');

    return {
      ok: true,
      action: 'restore_sticker_update',
      detail: 'Restored sticker metadata.'
    };
  } catch (error) {
    return {
      ok: false,
      action: 'restore_sticker_update',
      detail: error.message
    };
  }
}

async function rollbackDeletedEmoji(guild, oldEmoji) {
  if (!guild || !oldEmoji?.url || !oldEmoji?.name) {
    return {
      ok: false,
      action: 'recreate_deleted_emoji',
      detail: 'Emoji asset snapshot is unavailable.'
    };
  }

  try {
    const restored = await guild.emojis.create({
      attachment: oldEmoji.url,
      name: oldEmoji.name,
      reason: 'Anti-nuke rollback: emoji deletion'
    });

    return {
      ok: true,
      action: 'recreate_deleted_emoji',
      detail: `Recreated deleted emoji ${restored.name}.`,
      restoredEmojiId: restored.id
    };
  } catch (error) {
    return {
      ok: false,
      action: 'recreate_deleted_emoji',
      detail: error.message
    };
  }
}

async function rollbackBan(guild, targetId) {
  if (!targetId) {
    return {
      ok: false,
      action: 'unban_member',
      detail: 'No target ID was provided.'
    };
  }

  try {
    await guild.members.unban(targetId, 'Anti-nuke rollback: mass ban reversal');

    return {
      ok: true,
      action: 'unban_member',
      detail: `Unbanned ${targetId}.`
    };
  } catch (error) {
    return {
      ok: false,
      action: 'unban_member',
      detail: error.message
    };
  }
}

async function rollbackMemberRoleAdd(guild, memberId, roleIds = []) {
  const member = await guild.members.fetch(memberId).catch(() => null);

  if (!member) {
    return {
      ok: false,
      action: 'remove_added_roles',
      detail: 'Member could not be resolved.'
    };
  }

  const removed = [];
  const failed = [];

  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId);

    if (!role) continue;

    if (!role.editable) {
      failed.push(`${role.name}: hierarchy`);
      continue;
    }

    await member.roles.remove(role, 'Anti-nuke rollback: suspicious role add').then(() => {
      removed.push(role.name);
    }).catch((error) => {
      failed.push(`${role.name}: ${error.message}`);
    });
  }

  return {
    ok: failed.length === 0,
    action: 'remove_added_roles',
    detail: `Removed ${removed.length} added role(s).${failed.length ? ` Failed: ${failed.join(', ')}` : ''}`
  };
}

async function rollbackMemberRoleRemove(guild, memberId, roleIds = []) {
  const member = await guild.members.fetch(memberId).catch(() => null);

  if (!member) {
    return {
      ok: false,
      action: 'restore_removed_roles',
      detail: 'Member could not be resolved.'
    };
  }

  const restored = [];
  const failed = [];

  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId);

    if (!role) continue;

    if (!role.editable) {
      failed.push(`${role.name}: hierarchy`);
      continue;
    }

    await member.roles.add(role, 'Anti-nuke rollback: suspicious role removal').then(() => {
      restored.push(role.name);
    }).catch((error) => {
      failed.push(`${role.name}: ${error.message}`);
    });
  }

  return {
    ok: failed.length === 0,
    action: 'restore_removed_roles',
    detail: `Restored ${restored.length} removed role(s).${failed.length ? ` Failed: ${failed.join(', ')}` : ''}`
  };
}

async function rollbackWebhookCreate(channel) {
  if (!channel?.fetchWebhooks) {
    return {
      ok: false,
      action: 'delete_recent_webhooks',
      detail: 'Channel cannot fetch webhooks.'
    };
  }

  try {
    const webhooks = await channel.fetchWebhooks();
    let deleted = 0;

    for (const webhook of webhooks.values()) {
      const created = webhook.createdTimestamp || 0;
      if (Date.now() - created > 30_000) continue;

      await webhook.delete('Anti-nuke rollback: suspicious webhook creation').then(() => {
        deleted += 1;
      }).catch(() => null);
    }

    return {
      ok: true,
      action: 'delete_recent_webhooks',
      detail: `Deleted ${deleted} recent webhook(s).`
    };
  } catch (error) {
    return {
      ok: false,
      action: 'delete_recent_webhooks',
      detail: error.message
    };
  }
}

async function rollbackGuildUpdate(guild, oldGuild) {
  if (!guild || !oldGuild) {
    return {
      ok: false,
      action: 'restore_guild_update',
      detail: 'Old guild snapshot is unavailable.'
    };
  }

  const patch = {};

  if (oldGuild.name && guild.name !== oldGuild.name) {
    patch.name = oldGuild.name;
  }

  if (!Object.keys(patch).length) {
    return {
      ok: true,
      action: 'restore_guild_update',
      detail: 'No safely restorable guild fields changed.'
    };
  }

  try {
    await guild.edit(patch, 'Anti-nuke rollback: guild update');

    return {
      ok: true,
      action: 'restore_guild_update',
      detail: 'Restored guild settings where possible.'
    };
  } catch (error) {
    return {
      ok: false,
      action: 'restore_guild_update',
      detail: error.message
    };
  }
}

async function rollbackAntiNukeEvent(context) {
  const {
    guild,
    actionType,
    target,
    targetId,
    oldValue,
    newValue,
    config,
    actionConfig,
    metadata = {}
  } = context;

  const mode = rollbackAllowed(config, actionConfig);

  if (!mode || mode === 'off') {
    return [{
      ok: true,
      action: 'rollback_off',
      detail: 'Rollback is off for this action.'
    }];
  }

  try {
    if (actionType === 'channel_delete') return [await rollbackDeletedChannel(guild, oldValue || target)];
    if (actionType === 'role_delete') return [await rollbackDeletedRole(guild, oldValue || target)];
    if (actionType === 'emoji_delete') return [await rollbackDeletedEmoji(guild, oldValue || target)];

    if (actionType === 'channel_create') return [await rollbackCreatedChannel(target || newValue)];
    if (actionType === 'role_create') return [await rollbackCreatedRole(target || newValue)];
    if (actionType === 'emoji_create') return [await rollbackCreatedEmoji(target || newValue)];
    if (actionType === 'sticker_create') return [await rollbackCreatedSticker(target || newValue)];
    if (actionType === 'invite_create') return [await rollbackInviteCreate(target || newValue)];

    if (actionType === 'role_update' || actionType === 'role_permission_escalation') {
      return [await rollbackRoleUpdate(oldValue, newValue || target)];
    }

    if (actionType === 'channel_update') return [await rollbackChannelUpdate(oldValue, newValue || target)];
    if (actionType === 'emoji_update') return [await rollbackEmojiUpdate(oldValue, newValue || target)];
    if (actionType === 'sticker_update') return [await rollbackStickerUpdate(oldValue, newValue || target)];

    if (actionType === 'member_ban_add') return [await rollbackBan(guild, targetId)];
    if (actionType === 'member_role_add') return [await rollbackMemberRoleAdd(guild, targetId, metadata.roleIds || [])];
    if (actionType === 'member_role_remove') return [await rollbackMemberRoleRemove(guild, targetId, metadata.roleIds || [])];

    if (actionType === 'webhook_create') return [await rollbackWebhookCreate(target || newValue)];
    if (actionType === 'guild_update') return [await rollbackGuildUpdate(guild, oldValue)];

    return [{
      ok: true,
      action: 'rollback_not_supported',
      detail: `Rollback is not supported yet for ${actionType}.`
    }];
  } catch (error) {
    logger.warn({ error, guildId: guild?.id, actionType }, 'Anti-nuke rollback failed unexpectedly');

    return [{
      ok: false,
      action: 'rollback_error',
      detail: error.message
    }];
  }
}

module.exports = {
  rollbackAntiNukeEvent
};