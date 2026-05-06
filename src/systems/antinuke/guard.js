const db = require('../../services/database');
const logger = require('../logging/logger');
const { sendLog } = require('../logging/logDispatcher');
const { logSecurityEvent } = require('../logging/auditLog');
const { probeFakePermission } = require('../permissions/fakePermissions');
const { getProtectionSettings, isSecuritySystemEnabled } = require('../security/protectionConfig');
const {
  getTrustNobodySettings,
  trustedReasonWatched,
  applyOverbound
} = require('../security/trustNobody');
const { SECURITY_EVENT_TYPES } = require('../../utils/constants');

const { ACTIONS, normalizeActionId } = require('./actionTypes');
const { normalizeAntinukeConfig } = require('./config');
const { resolveExecutor } = require('./auditWatcher');
const { recordAction, markPunished } = require('./actionTracker');
const { executePunishment, getPunishmentChain } = require('./mitigation');
const { rollbackAntiNukeEvent } = require('./revertManager');
const { createIncident, updateIncident, shortId } = require('./incidentStore');

const LEGACY_EVENT_MAP = {
  channelDelete: 'channel_delete',
  channelCreate: 'channel_create',
  channelUpdate: 'channel_update',

  roleDelete: 'role_delete',
  roleCreate: 'role_create',
  roleUpdate: 'role_update',

  banAdd: 'member_ban_add',
  guildBanAdd: 'member_ban_add',
  memberBanAdd: 'member_ban_add',

  kick: 'member_kick',
  memberKick: 'member_kick',

  webhookCreate: 'webhook_create',
  webhookDelete: 'webhook_delete',
  webhookUpdate: 'webhook_update',

  emojiCreate: 'emoji_create',
  emojiDelete: 'emoji_delete',
  emojiUpdate: 'emoji_update',

  stickerCreate: 'sticker_create',
  stickerDelete: 'sticker_delete',
  stickerUpdate: 'sticker_update',

  botAdd: 'bot_add',
  guildUpdate: 'guild_update',

  inviteCreate: 'invite_create',
  inviteDelete: 'invite_delete'
};

function safeUserTag(user) {
  return user?.tag || user?.username || user?.id || 'Unknown';
}

function severityFromScore(score) {
  if (score >= 40) return 'critical';
  if (score >= 25) return 'high';
  if (score >= 12) return 'medium';
  return 'low';
}

function normalizeLegacyEventType(eventType) {
  const raw = String(eventType || '').trim();

  if (LEGACY_EVENT_MAP[raw]) return LEGACY_EVENT_MAP[raw];

  return normalizeActionId(raw) || raw;
}

function targetName(target, metadata = {}) {
  return (
    target?.name ||
    target?.tag ||
    target?.username ||
    target?.displayName ||
    metadata.targetName ||
    null
  );
}

function uniqueBy(items = [], keyFn) {
  const seen = new Set();
  const output = [];

  for (const item of items) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(item);
  }

  return output;
}

async function hasFakeBypass(guildId, member) {
  if (!member) return false;

  const checks = await Promise.all([
    probeFakePermission(guildId, member, 'RumiBypassAntinuke').catch(() => ({ ok: false })),
    probeFakePermission(guildId, member, 'RumiBypass').catch(() => ({ ok: false }))
  ]);

  return checks.some((check) => check.ok && check.value);
}

async function isTrustedExecutor(guild, executor, protection, member) {
  const config = normalizeAntinukeConfig(protection.antinuke || {});

  if (!executor) {
    return {
      trusted: false,
      reason: null
    };
  }

  if (executor.id === guild.ownerId) {
    return {
      trusted: true,
      reason: 'server_owner'
    };
  }

  if (executor.id === guild.client.user.id) {
    return {
      trusted: true,
      reason: 'self'
    };
  }

  if (config.admins?.includes(executor.id)) {
    return {
      trusted: true,
      reason: 'antinuke_admin'
    };
  }

  if (config.whitelist?.includes(executor.id)) {
    return {
      trusted: true,
      reason: 'legacy_whitelist'
    };
  }

  if (config.trustedUsers?.includes(executor.id)) {
    return {
      trusted: true,
      reason: 'trusted_user'
    };
  }

  if (executor.bot && config.trustedBots?.includes(executor.id)) {
    return {
      trusted: true,
      reason: 'trusted_bot'
    };
  }

  if (member && config.trustedRoles?.some((roleId) => member.roles.cache.has(roleId))) {
    return {
      trusted: true,
      reason: 'trusted_role'
    };
  }

  const globalWhitelist = await db.isWhitelisted(guild.id, executor.id).catch(() => false);

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

function describeTargets(targets = []) {
  if (!targets.length) return 'Unknown';

  return targets
    .slice(0, 8)
    .map((target) => {
      if (target.name && target.id) return `• ${target.name} (${target.id})`;
      if (target.name) return `• ${target.name}`;
      if (target.id) return `• ${target.id}`;
      return `• ${String(target).slice(0, 80)}`;
    })
    .join('\n');
}

async function logTrustedBypass(guild, executor, actionType, trustedInfo) {
  await sendLog(guild, 'antinukeAction', {
    title: 'Anti-Nuke Trusted Bypass',
    description: [
      `${executor} performed **${actionType}**.`,
      `Bypass reason: **${trustedInfo.reason}**`,
      '',
      'TrustNoOne is not watching this trust layer, so no mitigation was applied.'
    ].join('\n'),
    userId: executor.id
  }).catch(() => null);
}

async function logTrustNoOneAlert(guild, executor, actionType, trustedInfo, trustNobody, tracker) {
  await sendLog(guild, 'antinukeAction', {
    title: 'TrustNoOne Alert',
    description: [
      `${executor} exceeded the TrustNoOne overbound threshold.`,
      `Watched layer: **${trustedInfo.reason}**`,
      `Action: **${actionType}**`,
      `Overbound: **${trustNobody.overboundPercent}%**`,
      '',
      'Action mode is currently **alert**, so no mitigation was applied.'
    ].join('\n'),
    userId: executor.id,
    fields: [
      {
        name: 'Threshold result',
        value: [
          `Action count: ${tracker.actionCount}`,
          `Combined score: ${tracker.combinedScore || 0}`,
          `Triggered by: ${tracker.combinedTriggered ? 'combined score' : 'action threshold'}`
        ].join('\n'),
        inline: false
      }
    ]
  }).catch(() => null);
}

async function logIncident(guild, payload) {
  const {
    incident,
    executor,
    actionType,
    tracker,
    punishmentResults,
    rollbackResults,
    trustedInfo,
    trustNobody,
    watchedTrusted,
    action
  } = payload;

  const incidentLabel = shortId(incident.id);

  const punishmentText = punishmentResults?.length
    ? punishmentResults
      .map((result) => `• **${result.type}:** ${result.ok ? 'OK' : 'Failed'} — ${result.details}`)
      .join('\n')
    : 'No punishment applied.';

  const rollbackText = rollbackResults?.length
    ? rollbackResults
      .map((result) => `• **${result.action}:** ${result.ok ? 'OK' : 'Failed'} — ${result.detail}`)
      .join('\n')
    : 'No rollback attempted.';

  const sent = await sendLog(guild, 'antinukeAction', {
    title: `Anti-Nuke Triggered • ${action.label}`,
    description: [
      `Incident: \`${incidentLabel}\``,
      `Executor: ${executor ? `<@${executor.id}>` : 'Unknown'}`,
      `Action: **${actionType}**`,
      `Severity: **${incident.severity}**`,
      `Score: **${tracker.combinedScore || tracker.actionScore || 0}**`,
      watchedTrusted
        ? `TrustNoOne: **active** (${trustedInfo.reason}, ${trustNobody.overboundPercent}% overbound)`
        : null,
      trustedInfo?.trusted && !watchedTrusted
        ? `Trusted bypass: **${trustedInfo.reason}**`
        : null
    ].filter(Boolean).join('\n'),
    userId: executor?.id,
    fields: [
      {
        name: 'Threshold',
        value: [
          `Action count: ${tracker.actionCount}`,
          `Combined score: ${tracker.combinedScore || 0}`,
          `Triggered by: ${tracker.combinedTriggered ? 'combined score' : 'action threshold'}`
        ].join('\n'),
        inline: false
      },
      {
        name: 'Targets',
        value: describeTargets(incident.targets),
        inline: false
      },
      {
        name: 'Punishment',
        value: punishmentText.slice(0, 1024),
        inline: false
      },
      {
        name: 'Rollback',
        value: rollbackText.slice(0, 1024),
        inline: false
      }
    ]
  }).catch(() => null);

  if (sent?.id && !String(incident.id).startsWith('local-')) {
    await updateIncident(incident.id, {
      log_channel_id: sent.channel?.id || sent.channelId || null,
      log_message_id: sent.id
    }).catch(() => null);
  }
}

async function dmOwnerIfEnabled(guild, config, payload) {
  if (!config.ownerDm) return null;

  const {
    incident,
    executor,
    actionType,
    tracker,
    punishmentResults,
    rollbackResults,
    watchedTrusted,
    trustNobody
  } = payload;

  const owner = await guild.fetchOwner().catch(() => null);
  if (!owner) return null;

  const punishmentSummary = punishmentResults?.length
    ? punishmentResults.map((result) => `• ${result.type}: ${result.ok ? 'OK' : 'Failed'} — ${result.details}`).join('\n')
    : 'No punishment applied.';

  const rollbackSummary = rollbackResults?.length
    ? rollbackResults.map((result) => `• ${result.action}: ${result.ok ? 'OK' : 'Failed'} — ${result.detail}`).join('\n')
    : 'No rollback attempted.';

  return owner.send({
    embeds: [
      {
        title: 'Nuke Alert',
        description: [
          `Server: **${guild.name}**`,
          `Incident: \`${shortId(incident.id)}\``,
          `Executor: ${executor ? `${executor.tag || executor.username} (${executor.id})` : 'Unknown'}`,
          `Action: **${afctionType}**`,
          `Severity: **${incident.severity}**`,
          `Score: **${tracker.combinedScore || tracker.actionScore || 0}**`,
          watchedTrusted ? `TrustNoOne: active (${trustNobody.overboundPercent}% overbound)` : null
        ].filter(Boolean).join('\n'),
        fields: [
          {
            name: 'Punishment',
            value: punishmentSummary.slice(0, 1024),
            inline: false
          },
          {
            name: 'Rollback',
            value: rollbackSummary.slice(0, 1024),
            inline: false
          }
        ],
        timestamp: new Date().toISOString()
      }
    ]
  }).catch((error) => {
    logger.warn(
      {
        error,
        guildId: guild.id,
        ownerId: owner.id
      },
      'Could not DM server owner about anti-nuke incident'
    );

    return null;
  });
}

async function logLegacySecurityEvent(guild, executor, actionType, targetId, tracker, watchedTrusted) {
  if (!SECURITY_EVENT_TYPES?.NUKE_DETECTED) return;

  await logSecurityEvent({
    guildId: guild.id,
    actorId: executor.id,
    eventType: SECURITY_EVENT_TYPES.NUKE_DETECTED,
    confidence: 90,
    metadata: {
      trigger: actionType,
      count: tracker.actionCount,
      combinedScore: tracker.combinedScore,
      targetId,
      trustNoOneOverride: watchedTrusted
    }
  }).catch(() => null);
}

async function rollbackTriggeredEvents({
  guild,
  tracker,
  actionType,
  target,
  targetId,
  oldValue,
  newValue,
  metadata,
  config,
  actionConfig
}) {
  const sourceEvents = tracker.combinedTriggered
    ? tracker.combinedEvents
    : tracker.events;

  const events = uniqueBy(
    sourceEvents?.length
      ? sourceEvents
      : [{
          actionType,
          targetId,
          target,
          oldValue,
          newValue,
          metadata
        }],
    (event) => `${event.actionType}:${event.targetId || ''}:${event.at || ''}`
  );

  const results = [];

  for (const event of events) {
    const eventActionConfig = config.actions?.[event.actionType] || actionConfig;

    const rollback = await rollbackAntiNukeEvent({
      guild,
      actionType: event.actionType,
      target: event.target,
      targetId: event.targetId,
      oldValue: event.oldValue,
      newValue: event.newValue,
      metadata: event.metadata || {},
      config,
      actionConfig: eventActionConfig
    });

    results.push(...rollback);
  }

  return results;
}

async function handleAntiNukeEvent(event) {
  const {
    guild,
    actionType: rawActionType,
    targetId = null,
    target = null,
    oldValue = null,
    newValue = null,
    metadata = {}
  } = event || {};

  if (!guild) return null;

  const actionType = normalizeActionId(rawActionType) || normalizeLegacyEventType(rawActionType);
  if (!actionType) return null;

  const action = ACTIONS[actionType];
  if (!action) return null;

  const protection = await getProtectionSettings(guild.id).catch((error) => {
    logger.warn({ error, guildId: guild.id }, 'Anti-nuke settings could not be loaded');
    return null;
  });

  if (!protection || !isSecuritySystemEnabled(protection, 'antinuke')) return null;

  const config = normalizeAntinukeConfig(protection.antinuke || {});
  const actionConfig = config.actions[actionType];

  if (!config.enabled || !actionConfig?.enabled) return null;

  const audit = metadata.audit || await resolveExecutor(guild, action, targetId, {
    delayMs: metadata.auditDelayMs,
    retries: metadata.auditRetries,
    maxAgeMs: metadata.auditMaxAgeMs
  });

  const executor = audit?.executor;

  if (!executor) {
    await sendLog(guild, 'antinukeAction', {
      title: 'Anti-Nuke Event Unresolved',
      description: [
        'A dangerous event was detected, but I could not resolve the executor.',
        `Action: **${actionType}**`,
        `Target: \`${targetId || 'unknown'}\``
      ].join('\n'),
      fields: [
        {
          name: 'Possible reason',
          value: 'Discord audit logs may be delayed, unavailable, or Rumi may be missing View Audit Log.',
          inline: false
        }
      ]
    }).catch(() => null);

    return null;
  }

  if (executor.id === guild.client.user.id) return null;

  const member = await guild.members.fetch(executor.id).catch(() => null);
  const trustedInfo = await isTrustedExecutor(guild, executor, protection, member);
  const trustNobody = await getTrustNobodySettings(guild.id).catch(() => ({
    enabled: false,
    overboundPercent: 75,
    action: 'mitigate'
  }));

  const absoluteBypass = ['server_owner', 'self'].includes(trustedInfo.reason);
  const watchedTrusted = trustedInfo.trusted && trustedReasonWatched(trustedInfo.reason, trustNobody);

  if (trustedInfo.trusted && absoluteBypass) {
    return null;
  }

  if (trustedInfo.trusted && !watchedTrusted) {
    await logTrustedBypass(guild, executor, actionType, trustedInfo);
    return null;
  }

  const effectiveActionLimit = watchedTrusted
    ? applyOverbound(actionConfig.limit, trustNobody.overboundPercent)
    : actionConfig.limit;

  const effectiveCombinedScore = watchedTrusted && config.combinedScore
    ? {
        ...config.combinedScore,
        limit: applyOverbound(config.combinedScore.limit, trustNobody.overboundPercent)
      }
    : config.combinedScore;

  const tracker = recordAction({
    guildId: guild.id,
    executorId: executor.id,
    actionType,
    targetId,
    weight: actionConfig.weight,
    limit: effectiveActionLimit,
    windowSeconds: actionConfig.windowSeconds,
    combinedScoreConfig: effectiveCombinedScore,

    target,
    oldValue,
    newValue,
    metadata
  });

  if (!tracker.triggered) return null;
  if (tracker.recentlyPunished) return null;

  if (watchedTrusted && trustNobody.action === 'alert') {
    await logTrustNoOneAlert(guild, executor, actionType, trustedInfo, trustNobody, tracker);
    return null;
  }

  const score = Math.max(tracker.combinedScore || 0, tracker.actionScore || 0);
  const severity = severityFromScore(score);
  const punishmentChain = getPunishmentChain(config, actionConfig);

  const rollbackSourceEvents = tracker.combinedTriggered ? tracker.combinedEvents : tracker.events;
  const targetEvents = uniqueBy(
    rollbackSourceEvents?.length
      ? rollbackSourceEvents
      : [{ actionType, targetId, target, oldValue, newValue, metadata }],
    (item) => `${item.actionType}:${item.targetId || ''}:${item.at || ''}`
  );

  const incidentTargets = targetEvents.map((item) => ({
    id: item.targetId,
    name: targetName(item.target, item.metadata),
    type: item.metadata?.targetType || null,
    actionType: item.actionType
  }));

  const incident = await createIncident({
    guildId: guild.id,
    executorId: executor.id,
    executorTag: safeUserTag(executor),
    status: 'open',
    severity,
    score,
    actionTypes: [...new Set([
      actionType,
      ...targetEvents.map((item) => item.actionType)
    ])],
    targets: incidentTargets,
    thresholds: {
      actionCount: tracker.actionCount,
      actionLimit: effectiveActionLimit,
      originalActionLimit: actionConfig.limit,
      actionWindowSeconds: actionConfig.windowSeconds,

      combinedScore: tracker.combinedScore,
      combinedLimit: effectiveCombinedScore?.limit,
      originalCombinedLimit: config.combinedScore?.limit,
      combinedWindowSeconds: config.combinedScore?.windowSeconds,

      trustNoOneOverboundPercent: watchedTrusted ? trustNobody.overboundPercent : null
    },
    punishmentConfigured: punishmentChain,
    rollbackMode: actionConfig.rollback || config.rollback?.mode || 'off',
    trustedBypassUsed: trustedInfo.trusted,
    metadata: {
      actionType,
      audit,
      trustedInfo,
      trustNoOne: {
        enabled: trustNobody.enabled === true,
        watchedTrusted,
        overboundPercent: trustNobody.overboundPercent,
        action: trustNobody.action
      },
      eventMetadata: metadata
    }
  });

  const punishmentResults = await executePunishment({
    guild,
    executor,
    config,
    actionConfig,
    actionType,
    score,
    severe: severity === 'critical' || severity === 'high',
    reason: `Anti-nuke incident ${shortId(incident.id)}: ${actionType}`
  });

  markPunished(guild.id, executor.id);

  const rollbackResults = await rollbackTriggeredEvents({
    guild,
    tracker,
    actionType,
    target,
    targetId,
    oldValue,
    newValue,
    metadata,
    config,
    actionConfig
  });

  const punishmentOk = punishmentResults.some((result) => result.ok);
  const rollbackOk = rollbackResults.some((result) =>
    result.ok && !['rollback_off', 'rollback_not_supported'].includes(result.action)
  );

  await updateIncident(incident.id, {
    status: punishmentOk
      ? rollbackOk
        ? 'rollback_partial'
        : 'mitigated'
      : 'failed',
    punishment_results: punishmentResults,
    rollback_results: rollbackResults,
    resolved_at: new Date().toISOString()
  }).catch(() => null);

  await logLegacySecurityEvent(guild, executor, actionType, targetId, tracker, watchedTrusted);

  await logIncident(guild, {
    incident: {
      ...incident,
      severity,
      targets: incidentTargets
    },
    executor,
    actionType,
    tracker,
    punishmentResults,
    rollbackResults,
    trustedInfo,
    trustNobody,
    watchedTrusted,
    action
  });

  await dmOwnerIfEnabled(guild, config, {
    incident: {
      ...incident,
      severity
    },
    executor,
    actionType,
    tracker,
    punishmentResults,
    rollbackResults,
    watchedTrusted,
    trustNobody
  });

  return {
    incident,
    executor,
    punishmentResults,
    rollbackResults,
    watchedTrusted
  };
}

async function handleNukeAction(...args) {
  if (args.length === 1 && typeof args[0] === 'object') {
    return handleAntiNukeEvent(args[0]);
  }

  const [guild, _auditType, legacyEventType, targetId] = args;

  return handleAntiNukeEvent({
    guild,
    actionType: normalizeLegacyEventType(legacyEventType),
    targetId,
    metadata: {
      legacy: true
    }
  });
}

module.exports = {
  handleAntiNukeEvent,
  handleNukeAction
};