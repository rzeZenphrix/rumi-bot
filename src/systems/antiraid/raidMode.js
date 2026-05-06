const { ChannelType, PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const logger = require('../logging/logger');
const {
  updateProtectionSection
} = require('../security/protectionConfig');
const { normalizeAntiraidConfig } = require('./config');
const { getProtectionSettings } = require('../security/protectionConfig');
const { sendLog } = require('../logging/logDispatcher');

function nowIso() {
  return new Date().toISOString();
}

function futureIso(seconds) {
  return new Date(Date.now() + Number(seconds || 0) * 1000).toISOString();
}

function canManageChannel(guild, channel) {
  const me = guild.members.me;
  if (!me || !channel?.permissionsFor) return false;

  return channel.permissionsFor(me).has([
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ViewChannel
  ]);
}

function isTextLikeChannel(channel) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia
  ].includes(channel.type);
}

function getEveryoneOverwriteSnapshot(guild, channel) {
  const overwrite = channel.permissionOverwrites?.cache?.get(guild.roles.everyone.id);

  if (!overwrite) {
    return null;
  }

  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  };
}

async function saveChannelState({ guild, channel, incidentId, lockedByRumi = false }) {
  return db.upsertAntiRaidChannelState({
    guild_id: guild.id,
    channel_id: channel.id,
    incident_id: incidentId || null,
    original_slowmode_seconds: Number(channel.rateLimitPerUser || 0),
    locked_by_rumi: lockedByRumi,
    metadata: {
      channelName: channel.name,
      channelType: channel.type,
      everyoneOverwrite: getEveryoneOverwriteSnapshot(guild, channel)
    }
  }).catch((error) => {
    logger.warn(
      {
        error,
        guildId: guild.id,
        channelId: channel.id
      },
      'Could not save anti-raid channel state'
    );

    return null;
  });
}

async function applySlowmode(guild, config, incidentId) {
  const changed = [];
  const failed = [];

  const seconds = Number(config.raidMode?.slowmodeSeconds || 10);
  if (seconds <= 0) {
    return {
      ok: true,
      action: 'slowmode',
      changed,
      failed,
      detail: 'Slowmode is configured as 0 seconds, so nothing changed.'
    };
  }

  const ignoredChannels = new Set(config.ignoredChannels || []);

  const channels = guild.channels.cache.filter((channel) =>
    isTextLikeChannel(channel) &&
    !ignoredChannels.has(channel.id) &&
    typeof channel.setRateLimitPerUser === 'function'
  );

  for (const channel of channels.values()) {
    if (!canManageChannel(guild, channel)) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: 'Missing Manage Channels or View Channel.'
      });
      continue;
    }

    await saveChannelState({
      guild,
      channel,
      incidentId,
      lockedByRumi: false
    });

    try {
      await channel.setRateLimitPerUser(
        seconds,
        `Anti-raid raid mode: slowmode ${seconds}s`
      );

      changed.push({
        channelId: channel.id,
        channelName: channel.name,
        slowmodeSeconds: seconds
      });
    } catch (error) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: error.message
      });
    }
  }

  return {
    ok: failed.length === 0,
    action: 'slowmode',
    changed,
    failed,
    detail: `Applied slowmode to ${changed.length} channel(s).`
  };
}

async function applyLockdown(guild, config, incidentId) {
  const changed = [];
  const failed = [];

  const ignoredChannels = new Set(config.ignoredChannels || []);

  const channels = guild.channels.cache.filter((channel) =>
    isTextLikeChannel(channel) &&
    !ignoredChannels.has(channel.id) &&
    channel.permissionOverwrites?.edit
  );

  for (const channel of channels.values()) {
    if (!canManageChannel(guild, channel)) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: 'Missing Manage Channels or View Channel.'
      });
      continue;
    }

    await saveChannelState({
      guild,
      channel,
      incidentId,
      lockedByRumi: true
    });

    try {
      await channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          SendMessages: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
          SendMessagesInThreads: false
        },
        {
          reason: 'Anti-raid raid mode: lockdown'
        }
      );

      changed.push({
        channelId: channel.id,
        channelName: channel.name
      });
    } catch (error) {
      failed.push({
        channelId: channel.id,
        channelName: channel.name,
        reason: error.message
      });
    }
  }

  return {
    ok: failed.length === 0,
    action: 'lockdown',
    changed,
    failed,
    detail: `Locked ${changed.length} channel(s).`
  };
}

async function restoreChannelState(guild, state) {
  const channel = guild.channels.cache.get(state.channel_id);

  if (!channel) {
    return {
      ok: false,
      action: 'restore_channel_state',
      channelId: state.channel_id,
      detail: 'Channel no longer exists.'
    };
  }

  const results = [];

  if (typeof channel.setRateLimitPerUser === 'function') {
    try {
      await channel.setRateLimitPerUser(
        Number(state.original_slowmode_seconds || 0),
        'Anti-raid raid mode ended: restoring slowmode'
      );

      results.push('slowmode restored');
    } catch (error) {
      results.push(`slowmode failed: ${error.message}`);
    }
  }

  if (state.locked_by_rumi && channel.permissionOverwrites?.edit) {
    const snapshot = state.metadata?.everyoneOverwrite;

    try {
      if (!snapshot) {
        await channel.permissionOverwrites.delete(
          guild.roles.everyone,
          'Anti-raid raid mode ended: removing lockdown overwrite'
        );
      } else {
        await channel.permissionOverwrites.edit(
          guild.roles.everyone,
          {
            allow: BigInt(snapshot.allow || '0'),
            deny: BigInt(snapshot.deny || '0')
          },
          {
            reason: 'Anti-raid raid mode ended: restoring lockdown overwrite'
          }
        );
      }

      results.push('lockdown restored');
    } catch (error) {
      results.push(`lockdown restore failed: ${error.message}`);
    }
  }

  await db.removeAntiRaidChannelState(guild.id, channel.id).catch(() => null);

  return {
    ok: true,
    action: 'restore_channel_state',
    channelId: channel.id,
    detail: results.join(', ') || 'Nothing restored.'
  };
}

async function activateRaidMode({
  guild,
  config,
  incidentId = null,
  reason = 'Anti-raid raid mode activated'
}) {
  const normalized = normalizeAntiraidConfig(config || {});

  if (!normalized.raidMode?.enabled) {
    return {
      ok: false,
      action: 'raidmode',
      detail: 'Raid mode is disabled in configuration.',
      results: []
    };
  }

  const startedAt = nowIso();
  const endsAt = futureIso(normalized.raidMode.durationSeconds);

  const results = [];

  const actions = new Set(normalized.raidMode.actions || []);

  if (actions.has('slowmode')) {
    results.push(await applySlowmode(guild, normalized, incidentId));
  }

  if (actions.has('lockdown') || normalized.raidMode.lockChannels) {
    results.push(await applyLockdown(guild, normalized, incidentId));
  }

  await updateProtectionSection(guild.id, 'antiraid', (current) => {
    const next = normalizeAntiraidConfig(current || {});

    return {
      ...next,
      raidMode: {
        ...next.raidMode,
        active: true,
        activeIncidentId: incidentId,
        startedAt,
        endsAt
      }
    };
  }).catch((error) => {
    logger.warn(
      {
        error,
        guildId: guild.id
      },
      'Could not persist anti-raid raid mode state'
    );
  });

  return {
    ok: true,
    action: 'raidmode',
    detail: reason,
    startedAt,
    endsAt,
    results
  };
}

async function deactivateRaidMode({
  guild,
  config,
  reason = 'Anti-raid raid mode ended',
  incidentId = null
}) {
  const states = await db.listAntiRaidChannelStates(guild.id, {
    incidentId,
    limit: 200
  }).catch(() => []);

  const restoreResults = [];

  for (const state of states) {
    restoreResults.push(await restoreChannelState(guild, state));
  }

  await updateProtectionSection(guild.id, 'antiraid', (current) => {
    const next = normalizeAntiraidConfig(current || {});

    return {
      ...next,
      raidMode: {
        ...next.raidMode,
        active: false,
        activeIncidentId: null,
        startedAt: null,
        endsAt: null
      }
    };
  }).catch((error) => {
    logger.warn(
      {
        error,
        guildId: guild.id
      },
      'Could not persist anti-raid raid mode deactivation'
    );
  });

  return {
    ok: true,
    action: 'raidmode_end',
    detail: reason,
    restored: restoreResults
  };
}

function isRaidModeActive(config = {}) {
  const raidMode = config.raidMode || {};
  if (!raidMode.active) return false;

  if (!raidMode.endsAt) return true;

  return new Date(raidMode.endsAt).getTime() > Date.now();
}

async function sweepExpiredRaidModes(client) {
  const results = [];

  for (const guild of client.guilds.cache.values()) {
    const protection = await getProtectionSettings(guild.id).catch(() => null);
    if (!protection?.antiraid) continue;

    const config = normalizeAntiraidConfig(protection.antiraid);

    if (!config.raidMode?.active || !config.raidMode?.endsAt) continue;

    const expired = new Date(config.raidMode.endsAt).getTime() <= Date.now();
    if (!expired) continue;

    const result = await deactivateRaidMode({
      guild,
      config,
      incidentId: config.raidMode.activeIncidentId,
      reason: 'Anti-raid raid mode expired automatically.'
    }).catch((error) => ({
      ok: false,
      action: 'raidmode_expiry',
      detail: error.message
    }));

    await sendLog(guild, 'antiraidAction', {
      title: 'Anti-Raid Raid Mode Ended',
      description: [
        'Raid mode expired automatically.',
        `Result: **${result.ok ? 'Restored' : 'Failed'}**`,
        result.detail ? `Details: ${result.detail}` : null
      ].filter(Boolean).join('\n')
    }).catch(() => null);

    results.push({
      guildId: guild.id,
      result
    });
  }

  return results;
}

function startRaidModeExpiryWatcher(client, intervalMs = 60_000) {
  if (client.__rumiAntiRaidExpiryWatcher) {
    return client.__rumiAntiRaidExpiryWatcher;
  }

  client.__rumiAntiRaidExpiryWatcher = setInterval(() => {
    sweepExpiredRaidModes(client).catch((error) => {
      logger.warn(
        { error },
        'Anti-raid raid mode expiry sweep failed'
      );
    });
  }, intervalMs);

  client.__rumiAntiRaidExpiryWatcher.unref?.();

  return client.__rumiAntiRaidExpiryWatcher;
}

module.exports = {
  activateRaidMode,
  deactivateRaidMode,
  isRaidModeActive,
  applySlowmode,
  applyLockdown,
  restoreChannelState,
  sweepExpiredRaidModes,
  startRaidModeExpiryWatcher
};