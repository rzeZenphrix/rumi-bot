const { PermissionFlagsBits } = require('discord.js');
const logger = require('../logging/logger');
const { manageabilityState, moderatabilityState } = require('../../utils/permissions');
const { normalizeActions } = require('./config');
const { activateRaidMode } = require('./raidMode');
const { createRaidAction } = require('./incidentStore');

function canManageRole(role) {
  return role && !role.managed && role.editable;
}

async function recordAction({
  guild,
  incidentId,
  userId,
  actorId,
  actionType,
  actionResult,
  reason,
  metadata
}) {
  return createRaidAction({
    guildId: guild.id,
    incidentId,
    userId,
    actorId,
    actionType,
    actionResult,
    reason,
    metadata
  }).catch(() => null);
}

async function applyAlert({ guild, incidentId, member, reason }) {
  await recordAction({
    guild,
    incidentId,
    userId: member?.id || null,
    actionType: 'alert',
    actionResult: 'success',
    reason
  });

  return {
    ok: true,
    type: 'alert',
    details: 'Alert only. No direct action applied.'
  };
}

async function applyDeleteMessage({ guild, incidentId, member, message, reason }) {
  if (!message?.deletable) {
    await recordAction({
      guild,
      incidentId,
      userId: member?.id || message?.author?.id || null,
      actionType: 'delete',
      actionResult: 'failed',
      reason,
      metadata: {
        messageId: message?.id,
        channelId: message?.channelId,
        detail: 'Message is not deletable.'
      }
    });

    return {
      ok: false,
      type: 'delete',
      details: 'Message is not deletable.'
    };
  }

  try {
    await message.delete();

    await recordAction({
      guild,
      incidentId,
      userId: member?.id || message.author?.id || null,
      actionType: 'delete',
      actionResult: 'success',
      reason,
      metadata: {
        messageId: message.id,
        channelId: message.channelId
      }
    });

    return {
      ok: true,
      type: 'delete',
      details: 'Deleted raid/spam message.'
    };
  } catch (error) {
    await recordAction({
      guild,
      incidentId,
      userId: member?.id || message.author?.id || null,
      actionType: 'delete',
      actionResult: 'failed',
      reason,
      metadata: {
        messageId: message.id,
        channelId: message.channelId,
        error: error.message
      }
    });

    return {
      ok: false,
      type: 'delete',
      details: error.message
    };
  }
}

async function applyVerify({ guild, config, incidentId, member, reason }) {
  const roleId = config.verificationRoleId;

  if (!roleId) {
    return {
      ok: false,
      type: 'verify',
      details: 'No verification role is configured.'
    };
  }

  const role = guild.roles.cache.get(roleId);

  if (!canManageRole(role)) {
    return {
      ok: false,
      type: 'verify',
      details: 'Verification role is missing, managed, or above Rumi.'
    };
  }

  try {
    await member.roles.add(role, reason);

    await recordAction({
      guild,
      incidentId,
      userId: member.id,
      actionType: 'verify',
      actionResult: 'success',
      reason,
      metadata: {
        roleId
      }
    });

    return {
      ok: true,
      type: 'verify',
      details: `Assigned verification role ${role.name}.`
    };
  } catch (error) {
    return {
      ok: false,
      type: 'verify',
      details: error.message
    };
  }
}

async function applyQuarantine({ guild, config, incidentId, member, reason }) {
  const roleId = config.quarantineRoleId;

  if (!roleId) {
    return {
      ok: false,
      type: 'quarantine',
      details: 'No quarantine role is configured.'
    };
  }

  const role = guild.roles.cache.get(roleId);

  if (!canManageRole(role)) {
    return {
      ok: false,
      type: 'quarantine',
      details: 'Quarantine role is missing, managed, or above Rumi.'
    };
  }

  try {
    await member.roles.add(role, reason);

    await recordAction({
      guild,
      incidentId,
      userId: member.id,
      actionType: 'quarantine',
      actionResult: 'success',
      reason,
      metadata: {
        roleId
      }
    });

    return {
      ok: true,
      type: 'quarantine',
      details: `Assigned quarantine role ${role.name}.`
    };
  } catch (error) {
    return {
      ok: false,
      type: 'quarantine',
      details: error.message
    };
  }
}

async function applyJail({ guild, config, incidentId, member, reason }) {
  const roleId = config.jailRoleId || config.jail?.roleId;

  if (!roleId) {
    return {
      ok: false,
      type: 'jail',
      details: 'No jail role is configured.'
    };
  }

  const role = guild.roles.cache.get(roleId);

  if (!canManageRole(role)) {
    return {
      ok: false,
      type: 'jail',
      details: 'Jail role is missing, managed, or above Rumi.'
    };
  }

  try {
    await member.roles.add(role, reason);

    await recordAction({
      guild,
      incidentId,
      userId: member.id,
      actionType: 'jail',
      actionResult: 'success',
      reason,
      metadata: {
        roleId
      }
    });

    return {
      ok: true,
      type: 'jail',
      details: `Assigned jail role ${role.name}.`
    };
  } catch (error) {
    return {
      ok: false,
      type: 'jail',
      details: error.message
    };
  }
}

async function applyTimeout({ guild, config, incidentId, member, reason, severity }) {
  const safety = moderatabilityState(guild, member);

  if (!safety.ok) {
    return {
      ok: false,
      type: 'timeout',
      details: safety.reason
    };
  }

  const duration = severity === 'critical'
    ? 24 * 60 * 60 * 1000
    : severity === 'high'
      ? 60 * 60 * 1000
      : 10 * 60 * 1000;

  try {
    await member.timeout(duration, reason);

    await recordAction({
      guild,
      incidentId,
      userId: member.id,
      actionType: 'timeout',
      actionResult: 'success',
      reason,
      metadata: {
        durationMs: duration,
        severity
      }
    });

    return {
      ok: true,
      type: 'timeout',
      details: `Timed out for ${Math.round(duration / 60000)} minute(s).`
    };
  } catch (error) {
    return {
      ok: false,
      type: 'timeout',
      details: error.message
    };
  }
}

async function applyKick({ guild, incidentId, member, reason }) {
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

    await recordAction({
      guild,
      incidentId,
      userId: member.id,
      actionType: 'kick',
      actionResult: 'success',
      reason
    });

    return {
      ok: true,
      type: 'kick',
      details: 'Kicked member.'
    };
  } catch (error) {
    return {
      ok: false,
      type: 'kick',
      details: error.message
    };
  }
}

async function applyBan({ guild, incidentId, member, reason }) {
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

    await recordAction({
      guild,
      incidentId,
      userId: member.id,
      actionType: 'ban',
      actionResult: 'success',
      reason
    });

    return {
      ok: true,
      type: 'ban',
      details: 'Banned member.'
    };
  } catch (error) {
    return {
      ok: false,
      type: 'ban',
      details: error.message
    };
  }
}

async function applySoftban({ guild, incidentId, member, reason }) {
  const safety = manageabilityState(guild, member);

  if (!safety.ok) {
    return {
      ok: false,
      type: 'softban',
      details: safety.reason
    };
  }

  try {
    await member.ban({
      reason,
      deleteMessageSeconds: 24 * 60 * 60
    });

    await guild.members.unban(member.id, 'Anti-raid softban complete').catch(() => null);

    await recordAction({
      guild,
      incidentId,
      userId: member.id,
      actionType: 'softban',
      actionResult: 'success',
      reason
    });

    return {
      ok: true,
      type: 'softban',
      details: 'Softbanned member and removed recent messages.'
    };
  } catch (error) {
    return {
      ok: false,
      type: 'softban',
      details: error.message
    };
  }
}

async function applyRaidMode({ guild, config, incidentId, reason }) {
  const result = await activateRaidMode({
    guild,
    config,
    incidentId,
    reason
  });

  await recordAction({
    guild,
    incidentId,
    actionType: 'raidmode',
    actionResult: result.ok ? 'success' : 'failed',
    reason,
    metadata: result
  });

  return {
    ok: result.ok,
    type: 'raidmode',
    details: result.detail,
    result
  };
}

async function applySlowmode({ guild, config, incidentId, reason }) {
  const raidConfig = {
    ...config,
    raidMode: {
      ...config.raidMode,
      actions: ['slowmode'],
      lockChannels: false
    }
  };

  const result = await activateRaidMode({
    guild,
    config: raidConfig,
    incidentId,
    reason
  });

  return {
    ok: result.ok,
    type: 'slowmode',
    details: 'Applied raid-mode slowmode.',
    result
  };
}

async function applyLockdown({ guild, config, incidentId, reason }) {
  const raidConfig = {
    ...config,
    raidMode: {
      ...config.raidMode,
      actions: ['lockdown'],
      lockChannels: true
    }
  };

  const result = await activateRaidMode({
    guild,
    config: raidConfig,
    incidentId,
    reason
  });

  return {
    ok: result.ok,
    type: 'lockdown',
    details: 'Applied raid-mode lockdown.',
    result
  };
}

async function applyDeleteWebhook({ guild, incidentId, message, reason }) {
  if (!message?.webhookId || !message.channel?.fetchWebhooks) {
    return {
      ok: false,
      type: 'delete_webhook',
      details: 'Message is not from a resolvable webhook.'
    };
  }

  try {
    const webhooks = await message.channel.fetchWebhooks();
    const webhook = webhooks.get(message.webhookId);

    if (!webhook) {
      return {
        ok: false,
        type: 'delete_webhook',
        details: 'Webhook could not be found.'
      };
    }

    await webhook.delete(reason);

    await recordAction({
      guild,
      incidentId,
      actionType: 'delete_webhook',
      actionResult: 'success',
      reason,
      metadata: {
        webhookId: message.webhookId,
        channelId: message.channelId
      }
    });

    return {
      ok: true,
      type: 'delete_webhook',
      details: 'Deleted raid webhook.'
    };
  } catch (error) {
    return {
      ok: false,
      type: 'delete_webhook',
      details: error.message
    };
  }
}

async function applyAntiRaidActions(options) {
  const {
    guild,
    config,
    incidentId = null,
    member = null,
    message = null,
    actions = [],
    reason = 'Anti-raid mitigation',
    severity = 'medium'
  } = options;

  const cleanActions = normalizeActions(actions);
  const results = [];

  for (const action of cleanActions) {
    if (action === 'none') {
      results.push({
        ok: true,
        type: 'none',
        details: 'No action configured.'
      });
      continue;
    }

    if (action === 'alert') {
      results.push(await applyAlert({ guild, incidentId, member, reason }));
      continue;
    }

    if (action === 'delete') {
      results.push(await applyDeleteMessage({ guild, incidentId, member, message, reason }));
      continue;
    }

    if (!member && ['verify', 'quarantine', 'jail', 'timeout', 'kick', 'ban', 'softban'].includes(action)) {
      results.push({
        ok: false,
        type: action,
        details: 'No member was provided for this action.'
      });
      continue;
    }

    if (action === 'verify') {
      results.push(await applyVerify({ guild, config, incidentId, member, reason }));
      continue;
    }

    if (action === 'quarantine') {
      results.push(await applyQuarantine({ guild, config, incidentId, member, reason }));
      continue;
    }

    if (action === 'jail') {
      results.push(await applyJail({ guild, config, incidentId, member, reason }));
      continue;
    }

    if (action === 'timeout') {
      results.push(await applyTimeout({ guild, config, incidentId, member, reason, severity }));
      continue;
    }

    if (action === 'kick') {
      results.push(await applyKick({ guild, incidentId, member, reason }));
      continue;
    }

    if (action === 'ban') {
      results.push(await applyBan({ guild, incidentId, member, reason }));
      continue;
    }

    if (action === 'softban') {
      results.push(await applySoftban({ guild, incidentId, member, reason }));
      continue;
    }

    if (action === 'raidmode') {
      results.push(await applyRaidMode({ guild, config, incidentId, reason }));
      continue;
    }

    if (action === 'slowmode') {
      results.push(await applySlowmode({ guild, config, incidentId, reason }));
      continue;
    }

    if (action === 'lockdown') {
      results.push(await applyLockdown({ guild, config, incidentId, reason }));
      continue;
    }

    if (action === 'delete_webhook') {
      results.push(await applyDeleteWebhook({ guild, incidentId, message, reason }));
      continue;
    }

    results.push({
      ok: false,
      type: action,
      details: 'Unknown anti-raid action.'
    });
  }

  return results;
}

module.exports = {
  applyAntiRaidActions
};