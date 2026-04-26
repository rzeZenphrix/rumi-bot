const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const { logModerationAction } = require('../logging/auditLog');
const logger = require('../logging/logger');

const SNAPSHOT_TYPE = 'lockdown_channel_overwrites_v2';

const LOCKABLE_CHANNEL_TYPES = new Set(
  [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
  ].filter(Boolean)
);

const LOCK_PERMISSION_NAMES = [
  'SendMessages',
  'SendMessagesInThreads',
  'CreatePublicThreads',
  'CreatePrivateThreads',
  'AddReactions'
].filter((name) => PermissionFlagsBits[name]);

function canEditChannel(me, channel) {
  if (!me || !channel?.permissionOverwrites?.edit) return false;

  return me.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
}

function getExistingPermissionValue(overwrite, permissionName) {
  if (!overwrite) return null;

  const bit = PermissionFlagsBits[permissionName];
  if (!bit) return null;

  if (overwrite.allow.has(bit)) return true;
  if (overwrite.deny.has(bit)) return false;

  return null;
}

function buildCurrentOverwriteSnapshot(channel, everyoneRoleId) {
  const existing = channel.permissionOverwrites.cache.get(everyoneRoleId);
  const permissions = {};

  for (const permissionName of LOCK_PERMISSION_NAMES) {
    permissions[permissionName] = getExistingPermissionValue(existing, permissionName);
  }

  return {
    channelId: channel.id,
    channelName: channel.name,
    channelType: channel.type,
    permissions
  };
}

function buildLockOverwrite() {
  return LOCK_PERMISSION_NAMES.reduce((patch, permissionName) => {
    patch[permissionName] = false;
    return patch;
  }, {});
}

function buildRestoreOverwrite(snapshot) {
  const patch = {};

  for (const permissionName of LOCK_PERMISSION_NAMES) {
    if (Object.prototype.hasOwnProperty.call(snapshot.permissions || {}, permissionName)) {
      patch[permissionName] = snapshot.permissions[permissionName];
    }
  }

  return patch;
}

async function lockdownGuild(options) {
  const { guild, reason = 'Security lockdown', actorId = null } = options;
  const me = guild.members.me || await guild.members.fetchMe();
  const snapshots = [];
  const failed = [];

  for (const channel of guild.channels.cache.values()) {
    if (!LOCKABLE_CHANNEL_TYPES.has(channel.type)) continue;

    if (!canEditChannel(me, channel)) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: 'Missing Manage Channels in this channel'
      });
      continue;
    }

    const snapshot = buildCurrentOverwriteSnapshot(channel, guild.roles.everyone.id);

    try {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        buildLockOverwrite(),
        { reason }
      );

      snapshots.push(snapshot);
    } catch (error) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: error.message
      });

      logger.warn(
        {
          error,
          guildId: guild.id,
          channelId: channel.id
        },
        'Could not lock channel'
      );
    }
  }

  await db.insertSnapshot({
    guild_id: guild.id,
    snapshot_type: SNAPSHOT_TYPE,
    payload: {
      snapshots,
      failed,
      reason,
      actorId,
      lockedAt: new Date().toISOString()
    }
  }).catch((error) => {
    logger.error(
      {
        error,
        guildId: guild.id
      },
      'Could not save lockdown snapshot'
    );
  });

  await db.updateGuildSettings(guild.id, {
    lockdown_active: true
  }).catch(() => null);

  await logModerationAction({
    guildId: guild.id,
    userId: null,
    moderatorId: actorId,
    botAction: !actorId,
    actionType: 'guild_lockdown',
    reason,
    metadata: {
      channelCount: snapshots.length,
      failedCount: failed.length
    }
  });

  return {
    ok: true,
    channelCount: snapshots.length,
    failedCount: failed.length,
    failed
  };
}

async function unlockdownGuild(options) {
  const { guild, reason = 'Manual security unlockdown', actorId = null } = options;
  const me = guild.members.me || await guild.members.fetchMe();
  const snapshot = await db.getLatestSnapshot(guild.id, SNAPSHOT_TYPE);

  if (!snapshot) {
    return {
      ok: false,
      reason: 'I could not find an unrestored lockdown snapshot for this server.'
    };
  }

  const snapshots = snapshot.payload?.snapshots || [];
  const failed = [];
  let restoredCount = 0;

  for (const channelSnapshot of snapshots) {
    const channel = guild.channels.cache.get(channelSnapshot.channelId);

    if (!channel) {
      failed.push({
        channelId: channelSnapshot.channelId,
        reason: 'Channel no longer exists'
      });
      continue;
    }

    if (!canEditChannel(me, channel)) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: 'Missing Manage Channels in this channel'
      });
      continue;
    }

    try {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        buildRestoreOverwrite(channelSnapshot),
        { reason }
      );

      restoredCount += 1;
    } catch (error) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: error.message
      });

      logger.warn(
        {
          error,
          guildId: guild.id,
          channelId: channel.id
        },
        'Could not restore channel after lockdown'
      );
    }
  }

  if (!failed.length) {
    await db.markSnapshotRestored(snapshot.id).catch(() => null);

    await db.updateGuildSettings(guild.id, {
      lockdown_active: false
    }).catch(() => null);
  }

  await logModerationAction({
    guildId: guild.id,
    userId: null,
    moderatorId: actorId,
    botAction: !actorId,
    actionType: 'guild_unlockdown',
    reason,
    metadata: {
      restoredCount,
      failedCount: failed.length,
      snapshotId: snapshot.id
    }
  });

  return {
    ok: true,
    restoredCount,
    failedCount: failed.length,
    failed,
    fullyRestored: failed.length === 0
  };
}

module.exports = {
  SNAPSHOT_TYPE,
  lockdownGuild,
  unlockdownGuild
};