const db = require('../../services/database');
const logger = require('../logging/logger');
const { sendLog } = require('../logging/logDispatcher');
const { probeFakePermission } = require('../permissions/fakePermissions');
const {
  getProtectionSettings,
  isSecuritySystemEnabled
} = require('../security/protectionConfig');

const { normalizeAntiraidConfig } = require('./config');
const { isRaidModeActive } = require('./raidMode');
const { applyAntiRaidActions } = require('./mitigation');
const {
  createRaidIncident,
  updateRaidIncident,
  shortRaidId,
  flagRaidMember,
  listRaidMemberFlags
} = require('./incidentStore');

const { scoreMemberJoin } = require('./riskScorer');
const { recordJoin } = require('./joinTracker');
const { recordMessage } = require('./messageTracker');
const { resolveUsedInvite } = require('./inviteTracker');
const giveawayStore = require('../giveaways/store');

function safeUserTag(user) {
  return user?.tag || user?.username || user?.id || 'Unknown';
}

function severityFromScore(score) {
  const value = Number(score || 0);

  if (value >= 75) return 'critical';
  if (value >= 50) return 'high';
  if (value >= 25) return 'medium';
  return 'low';
}

function triggeredReasons(triggered = {}) {
  return Object.entries(triggered)
    .filter(([, value]) => value)
    .map(([key]) => key);
}

function hasIgnoredRole(member, ignoredRoles = []) {
  if (!member?.roles?.cache) return false;
  return ignoredRoles.some((roleId) => member.roles.cache.has(roleId));
}

function listUserMentions(users = []) {
  if (!users.length) return 'None';

  return users
    .slice(0, 20)
    .map((user) => `<@${user.id || user.userId}>`)
    .join(', ');
}

function uniqueEvents(events = []) {
  const seen = new Set();
  const output = [];

  for (const event of events) {
    const key = `${event.channelId}:${event.messageId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(event);
  }

  return output;
}

async function hasFakeBypass(guildId, member) {
  if (!member) return false;

  const checks = await Promise.all([
    probeFakePermission(guildId, member, 'RumiBypassAntiraid').catch(() => ({ ok: false })),
    probeFakePermission(guildId, member, 'RumiBypass').catch(() => ({ ok: false }))
  ]);

  return checks.some((check) => check.ok && check.value);
}

async function isTrustedMember(guild, member, config) {
  if (!member) {
    return {
      trusted: false,
      reason: null
    };
  }

  if (member.id === guild.ownerId) {
    return {
      trusted: true,
      reason: 'server_owner'
    };
  }

  if (config.trustedUsers?.includes(member.id)) {
    return {
      trusted: true,
      reason: 'trusted_user'
    };
  }

  if (member.user?.bot && config.trustedBots?.includes(member.id)) {
    return {
      trusted: true,
      reason: 'trusted_bot'
    };
  }

  if (config.trustedRoles?.some((roleId) => member.roles.cache.has(roleId))) {
    return {
      trusted: true,
      reason: 'trusted_role'
    };
  }

  if (hasIgnoredRole(member, config.ignoredRoles)) {
    return {
      trusted: true,
      reason: 'ignored_role'
    };
  }

  const globalWhitelist = await db.isWhitelisted(guild.id, member.id).catch(() => false);

  if (globalWhitelist) {
    return {
      trusted: true,
      reason: 'global_whitelist'
    };
  }

  const fakeBypass = await hasFakeBypass(guild.id, member);

  if (fakeBypass) {
    return {
      trusted: true,
      reason: 'fake_permission'
    };
  }

  return {
    trusted: false,
    reason: null
  };
}

async function loadAntiRaid(guild) {
  const protection = await getProtectionSettings(guild.id).catch((error) => {
    logger.warn(
      {
        error,
        guildId: guild.id
      },
      'Anti-raid settings could not be loaded'
    );

    return null;
  });

  if (!protection) return null;
  if (!isSecuritySystemEnabled(protection, 'antiraid')) return null;

  const config = normalizeAntiraidConfig(protection.antiraid || protection.settings?.antiraid || {});

  if (!config.enabled) return null;

  return {
    protection,
    config
  };
}

async function dmOwnerIfEnabled(guild, config, payload) {
  if (!config.ownerDm) {
    return {
      ok: false,
      skipped: true,
      reason: 'Owner DM disabled.'
    };
  }

  const {
    incident,
    title,
    description,
    fields = []
  } = payload;

  const ownerUser = await guild.client.users.fetch(guild.ownerId).catch(() => null);

  if (!ownerUser) {
    return {
      ok: false,
      skipped: false,
      reason: 'Could not fetch server owner user.'
    };
  }

  return ownerUser.send({
    embeds: [
      {
        title,
        description: [
          `Server: **${guild.name}**`,
          `Incident: \`${shortRaidId(incident.id)}\``,
          '',
          description
        ].join('\n').slice(0, 4096),
        fields,
        timestamp: new Date().toISOString()
      }
    ]
  }).then(() => ({
    ok: true,
    skipped: false,
    reason: 'Owner DM sent.'
  })).catch((error) => {
    logger.warn(
      {
        error,
        guildId: guild.id,
        ownerId: guild.ownerId
      },
      'Could not DM owner about anti-raid incident'
    );

    return {
      ok: false,
      skipped: false,
      reason: error.message
    };
  });
}

async function logRaid(guild, config, payload) {
  const {
    incident,
    title,
    description,
    fields = []
  } = payload;

  const mention = config.alertRoleId ? `<@&${config.alertRoleId}> ` : '';

  const sent = await sendLog(guild, 'antiraidAction', {
    title,
    description: `${mention}${description}`.slice(0, 4096),
    fields
  }).catch(() => null);

  if (sent?.id && !String(incident.id).startsWith('local-raid-')) {
    await updateRaidIncident(incident.id, {
      log_channel_id: sent.channel?.id || sent.channelId || null,
      log_message_id: sent.id
    }).catch(() => null);
  }

  return sent;
}

function selectJoinActions(config, severity, triggerList) {
  if (triggerList.includes('botRaid')) {
    return config.botRaid?.punishment || ['kick'];
  }

  if (
    triggerList.includes('joinVelocity') ||
    triggerList.includes('waveRisk') ||
    triggerList.includes('inviteBurst')
  ) {
    return ['raidmode', ...(config.join?.punishments?.[severity] || [])];
  }

  if (triggerList.includes('raidModeNewJoin')) {
    return config.join?.punishments?.[severity] || ['quarantine'];
  }

  return config.join?.punishments?.[severity] || ['alert'];
}

async function createJoinIncident({
  guild,
  member,
  invite,
  memberRisk,
  joinResult,
  severity,
  riskScore,
  triggerList
}) {
  return createRaidIncident({
    guildId: guild.id,
    status: triggerList.includes('joinVelocity') || triggerList.includes('waveRisk') || triggerList.includes('inviteBurst')
      ? 'active_raidmode'
      : 'open',
    severity,
    triggerType: triggerList.join(',') || 'join_risk',
    riskScore,
    waveStats: joinResult.stats,
    affectedUsers: joinResult.events.map((event) => ({
      id: event.userId,
      username: event.username,
      displayName: event.displayName,
      bot: event.bot,
      freshAccount: event.freshAccount,
      noAvatar: event.noAvatar,
      inviteCode: event.inviteCode
    })),
    inviteSource: invite || {},
    channelsAffected: [],
    metadata: {
      joinedUserId: member.id,
      memberRisk,
      triggers: triggerList
    }
  });
}

async function resolveAndRecordInviteJoin(member) {
  const invite = await resolveUsedInvite(member.guild).catch(() => null);
  if (invite?.code) {
    await giveawayStore.recordInviteJoin({
      guild_id: member.guild.id,
      invite_code: invite.code,
      inviter_user_id: invite.inviterId || null,
      joined_member_id: member.id,
      source: invite.vanity ? 'vanity' : 'discord',
      metadata: {
        channelId: invite.channelId || null,
        usesDelta: invite.usesDelta || 0
      }
    }).catch(() => null);
  }
  return invite;
}

async function handleAntiRaidJoin(member, preResolvedInvite) {
  if (!member?.guild) return null;

  const invite = preResolvedInvite === undefined ? await resolveAndRecordInviteJoin(member) : preResolvedInvite;

  const loaded = await loadAntiRaid(member.guild);
  if (!loaded) return null;

  const { config } = loaded;

  if (!config.join?.enabled) return null;
  if (hasIgnoredRole(member, config.ignoredRoles)) return null;

  const trusted = await isTrustedMember(member.guild, member, config);
  if (trusted.trusted) return null;

  if (invite?.code && config.ignoredInvites?.includes(invite.code)) {
    return null;
  }

  const previousFlags = await listRaidMemberFlags(member.guild.id, {
    userId: member.id,
    limit: 20
  }).catch(() => []);

  const raidModeActive = isRaidModeActive(config);

  const joinResult = recordJoin(member, {
    config,
    inviteCode: invite?.code || null,
    previousFlags
  });

  const memberRisk = scoreMemberJoin(member, {
    config,
    raidModeActive,
    inviteCode: invite?.code || null,
    inviteBurst: joinResult.inviteBurst,
    duplicateNameCount: joinResult.duplicateNameCount,
    similarNameCount: joinResult.similarNameCount,
    previousFlags
  });

  const triggerList = triggeredReasons(joinResult.triggered);

  if (memberRisk.score >= Number(config.join?.memberRiskThreshold || 50)) {
    triggerList.push('memberRisk');
  }

  if (raidModeActive && memberRisk.score >= 25) {
    triggerList.push('raidModeNewJoin');
  }

  const riskScore = Math.max(memberRisk.score, joinResult.stats.waveRisk.score);
  const severity = severityFromScore(riskScore);

  if (!triggerList.length) {
    return {
      triggered: false,
      memberRisk,
      joinResult
    };
  }

  await flagRaidMember({
    guildId: member.guild.id,
    userId: member.id,
    flagType: `raid_join_${severity}`,
    riskScore,
    reason: triggerList.join(', '),
    metadata: {
      memberRisk,
      waveRisk: joinResult.stats.waveRisk,
      invite,
      triggers: triggerList
    },
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  }).catch(() => null);

  const incident = await createJoinIncident({
    guild: member.guild,
    member,
    invite,
    memberRisk,
    joinResult,
    severity,
    riskScore,
    triggerList
  });

  const actions = selectJoinActions(config, severity, triggerList);

  const mitigationResults = await applyAntiRaidActions({
    guild: member.guild,
    config,
    incidentId: incident.id,
    member,
    actions,
    severity,
    reason: `Anti-raid incident ${shortRaidId(incident.id)}: ${triggerList.join(', ')}`
  });

  const raidModeActions = mitigationResults.filter((result) =>
    ['raidmode', 'slowmode', 'lockdown'].includes(result.type)
  );

  await updateRaidIncident(incident.id, {
    punishments_applied: mitigationResults,
    raid_mode_actions: raidModeActions,
    status: mitigationResults.some((result) => result.ok) ? 'mitigated' : 'failed',
    resolved_at: raidModeActions.length ? null : new Date().toISOString()
  }).catch(() => null);

  const description = [
    `Trigger: **${triggerList.join(', ')}**`,
    `Risk score: **${riskScore}**`,
    `Severity: **${severity}**`,
    `Joined member: <@${member.id}>`,
    invite?.code ? `Invite: \`${invite.code}\`` : null,
    '',
    '**Member reasons**',
    memberRisk.reasons.length ? memberRisk.reasons.map((item) => `• ${item}`).join('\n') : 'No member-level reasons recorded.',
    '',
    '**Wave reasons**',
    joinResult.stats.waveRisk.reasons.length ? joinResult.stats.waveRisk.reasons.map((item) => `• ${item}`).join('\n') : 'No wave-level reasons recorded.'
  ].filter(Boolean).join('\n');

  const fields = [
    {
      name: 'Affected users in window',
      value: listUserMentions(joinResult.events.map((event) => ({ id: event.userId }))).slice(0, 1024),
      inline: false
    },
    {
      name: 'Mitigation',
      value: mitigationResults.length
        ? mitigationResults.map((result) => `• ${result.type}: ${result.ok ? 'OK' : 'Failed'} — ${result.details}`).join('\n').slice(0, 1024)
        : 'None',
      inline: false
    }
  ];

  await logRaid(member.guild, config, {
    incident,
    title: 'Anti-Raid Triggered',
    description,
    fields
  });

  const dmResult = await dmOwnerIfEnabled(member.guild, config, {
    incident,
    title: 'Rumi Anti-Raid Alert',
    description,
    fields
  });

  await updateRaidIncident(incident.id, {
    metadata: {
      ...(incident.metadata || {}),
      ownerDm: dmResult
    }
  }).catch(() => null);

  return {
    triggered: true,
    incident,
    memberRisk,
    joinResult,
    mitigationResults,
    ownerDm: dmResult
  };
}

function messageShouldIgnore(message, config) {
  if (!message.guild) return true;
  if (message.author?.bot && !message.webhookId) return true;
  if (config.ignoredChannels?.includes(message.channelId)) return true;

  if (message.member && hasIgnoredRole(message.member, config.ignoredRoles)) {
    return true;
  }

  return false;
}

async function bulkDeleteTrackedMessages(guild, events = [], reason = 'Anti-raid cleanup') {
  const unique = uniqueEvents(events).slice(0, 25);
  let deleted = 0;
  const failed = [];

  for (const event of unique) {
    const channel = guild.channels.cache.get(event.channelId) ||
      await guild.channels.fetch(event.channelId).catch(() => null);

    if (!channel?.messages?.fetch) continue;

    const message = await channel.messages.fetch(event.messageId).catch(() => null);
    if (!message || !message.deletable) continue;

    await message.delete().then(() => {
      deleted += 1;
    }).catch((error) => {
      failed.push({
        messageId: event.messageId,
        channelId: event.channelId,
        reason: error.message
      });
    });
  }

  return {
    deleted,
    failed,
    reason
  };
}

async function createMessageIncident({
  guild,
  message,
  record,
  severity,
  riskScore,
  triggerList
}) {
  return createRaidIncident({
    guildId: guild.id,
    status: 'open',
    severity,
    triggerType: `message_${triggerList.join(',') || 'risk'}`,
    riskScore,
    waveStats: {
      counts: record.counts,
      risk: record.risk,
      triggered: record.triggered
    },
    affectedUsers: [
      {
        id: message.author?.id,
        username: message.author?.username,
        displayName: message.member?.displayName || null,
        bot: message.author?.bot,
        webhookId: message.webhookId || null
      }
    ],
    channelsAffected: [
      {
        id: message.channelId,
        name: message.channel?.name || null
      }
    ],
    metadata: {
      messageId: message.id,
      channelId: message.channelId,
      webhookId: message.webhookId || null,
      contentHash: record.event.contentHash,
      triggers: triggerList
    }
  });
}

function selectMessageActions(config, message, triggerList) {
  if (message.webhookId || triggerList.includes('webhook')) {
    return config.webhook?.action || ['delete_webhook', 'lockdown'];
  }

  return config.message?.punishment || ['delete', 'timeout'];
}

async function handleAntiRaidMessage(message) {
  if (!message?.guild) return null;

  const loaded = await loadAntiRaid(message.guild);
  if (!loaded) return null;

  const { config } = loaded;

  if (!config.message?.enabled) return null;
  if (messageShouldIgnore(message, config)) return null;

  if (message.member) {
    const trusted = await isTrustedMember(message.guild, message.member, config);
    if (trusted.trusted) return null;
  }

  const record = recordMessage(message, {
    config
  });

  if (record.ignored) return null;

  const triggerList = triggeredReasons(record.triggered);

  const webhookTriggered = Boolean(
    message.webhookId &&
    config.webhook?.enabled &&
    record.counts.webhookMessages >= Number(config.webhook?.messageLimit || 5)
  );

  if (webhookTriggered && !triggerList.includes('webhook')) {
    triggerList.push('webhook');
  }

  const riskScore = webhookTriggered
    ? Math.max(record.risk.score, 50)
    : record.risk.score;

  const severity = severityFromScore(riskScore);

  if (!triggerList.length && riskScore < 50) {
    return {
      triggered: false,
      record
    };
  }

  if (message.author?.id) {
    await flagRaidMember({
      guildId: message.guild.id,
      userId: message.author.id,
      flagType: `raid_message_${severity}`,
      riskScore,
      reason: triggerList.join(', '),
      metadata: {
        risk: record.risk,
        counts: record.counts,
        messageId: message.id,
        channelId: message.channelId,
        webhookId: message.webhookId || null
      },
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    }).catch(() => null);
  }

  const incident = await createMessageIncident({
    guild: message.guild,
    message,
    record,
    severity,
    riskScore,
    triggerList
  });

  const actions = selectMessageActions(config, message, triggerList);

  const cleanupEvents = [
    ...record.recentUserEvents,
    ...record.recentDuplicateEvents,
    ...record.recentWebhookEvents
  ];

  const cleanupResult = await bulkDeleteTrackedMessages(
    message.guild,
    cleanupEvents,
    `Anti-raid incident ${shortRaidId(incident.id)}: bulk cleanup`
  );

  const mitigationResults = await applyAntiRaidActions({
    guild: message.guild,
    config,
    incidentId: incident.id,
    member: message.member || null,
    message,
    actions,
    severity,
    reason: `Anti-raid incident ${shortRaidId(incident.id)}: message_${triggerList.join(',') || 'risk'}`
  });

  const raidModeActions = mitigationResults.filter((result) =>
    ['raidmode', 'slowmode', 'lockdown'].includes(result.type)
  );

  await updateRaidIncident(incident.id, {
    messages_deleted: cleanupResult.deleted +
      (mitigationResults.some((result) => result.type === 'delete' && result.ok) ? 1 : 0),
    punishments_applied: mitigationResults,
    raid_mode_actions: raidModeActions,
    status: mitigationResults.some((result) => result.ok) || cleanupResult.deleted > 0 ? 'mitigated' : 'failed',
    resolved_at: raidModeActions.length ? null : new Date().toISOString(),
    metadata: {
      ...(incident.metadata || {}),
      cleanupResult
    }
  }).catch(() => null);

  const description = [
    `Trigger: **${triggerList.join(', ') || 'message risk'}**`,
    `Risk score: **${riskScore}**`,
    `Severity: **${severity}**`,
    message.webhookId ? `Webhook ID: \`${message.webhookId}\`` : `User: <@${message.author.id}>`,
    `Channel: <#${message.channelId}>`,
    '',
    '**Reasons**',
    record.risk.reasons.length ? record.risk.reasons.map((item) => `• ${item}`).join('\n') : 'No reasons recorded.'
  ].join('\n');

  const fields = [
    {
      name: 'Counts',
      value: [
        `User messages: ${record.counts.userMessages}`,
        `Duplicate messages: ${record.counts.duplicateMessages}`,
        `Webhook messages: ${record.counts.webhookMessages}`,
        `Unique duplicate users: ${record.counts.uniqueDuplicateUsers}`,
        `Links: ${record.counts.userLinks}`,
        `Mentions: ${record.counts.mentions}`,
        `Bulk deleted: ${cleanupResult.deleted}`
      ].join('\n'),
      inline: false
    },
    {
      name: 'Mitigation',
      value: mitigationResults.length
        ? mitigationResults.map((result) => `• ${result.type}: ${result.ok ? 'OK' : 'Failed'} — ${result.details}`).join('\n').slice(0, 1024)
        : 'None',
      inline: false
    }
  ];

  await logRaid(message.guild, config, {
    incident,
    title: message.webhookId ? 'Anti-Raid Webhook Defense Triggered' : 'Anti-Raid Message Defense Triggered',
    description,
    fields
  });

  const dmResult = await dmOwnerIfEnabled(message.guild, config, {
    incident,
    title: message.webhookId ? 'Rumi Anti-Raid Webhook Alert' : 'Rumi Anti-Raid Message Alert',
    description,
    fields
  });

  await updateRaidIncident(incident.id, {
    metadata: {
      ...(incident.metadata || {}),
      ownerDm: dmResult,
      cleanupResult
    }
  }).catch(() => null);

  return {
    triggered: true,
    incident,
    record,
    mitigationResults,
    cleanupResult,
    ownerDm: dmResult
  };
}

module.exports = {
  resolveAndRecordInviteJoin,
  handleAntiRaidJoin,
  handleAntiRaidMessage,

  // Backward-compatible aliases for older event files
  handleMemberJoin: handleAntiRaidJoin,
  handleMessageCreate: handleAntiRaidMessage,

  loadAntiRaid,
  isTrustedMember,
  dmOwnerIfEnabled
};
