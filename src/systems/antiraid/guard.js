const db = require('../../services/database');
const { SECURITY_EVENT_TYPES } = require('../../utils/constants');
const { memberHasPermission, probeFakePermission } = require('../permissions/fakePermissions');
const { jailMember } = require('../jail/jailManager');
const { logModerationAction, logSecurityEvent } = require('../logging/auditLog');
const logger = require('../logging/logger');
const { sendLog } = require('../logging/logDispatcher');
const { getProtectionSettings, isSecuritySystemEnabled } = require('../security/protectionConfig');
const { manageabilityState, moderatabilityState } = require('../../utils/permissions');

const buckets = new Map();
const alerts = new Map();
const ALERT_COOLDOWN_MS = 15000;

function getBucket(guildId, windowMs) {
  const now = Date.now();
  const recent = (buckets.get(guildId) || []).filter((entry) => now - entry.joinedAt <= windowMs);
  buckets.set(guildId, recent);
  return recent;
}

function accountAgeDays(member) {
  const createdTimestamp = member.user?.createdTimestamp || 0;
  return (Date.now() - createdTimestamp) / 86400000;
}

function computeConfidence(recentJoins, thresholds) {
  const burst = recentJoins.length;
  const lowAgeCount = recentJoins.filter((entry) => entry.lowAge).length;
  let confidence = 0;

  if (burst >= thresholds.joinBurst) confidence = Math.max(confidence, 72);
  if (lowAgeCount >= thresholds.lowAgeBurst) confidence = Math.max(confidence, thresholds.quarantineConfidence);
  if (burst >= thresholds.joinBurst + 3) confidence = Math.max(confidence, thresholds.lockdownConfidence);

  return {
    confidence,
    burst,
    lowAgeCount
  };
}

async function maybeLockVerificationChannel(guild, config, reason) {
  const channelId =
    config.verificationChannelId ||
    null;

  if (!channelId) {
    return {
      ok: false,
      reason: 'No verification channel is configured'
    };
  }

  const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.permissionOverwrites?.edit) {
    return {
      ok: false,
      reason: 'The configured verification channel no longer exists'
    };
  }

  await channel.permissionOverwrites.edit(
    guild.roles.everyone,
    {
      SendMessages: false,
      SendMessagesInThreads: false,
      CreatePublicThreads: false,
      CreatePrivateThreads: false
    },
    { reason }
  );

  return {
    ok: true,
    channel
  };
}

async function applyRaidAction(member, config, summary) {
  const guild = member.guild;
  const reason = `Anti-raid: ${summary.burst} joins in ${summary.windowSeconds}s`;

  if (config.action === 'timeout') {
    const moderateState = moderatabilityState(guild, member);
    if (!moderateState.ok) return `Could not timeout ${member}: ${moderateState.reason}`;

    await member.timeout(config.timeoutMinutes * 60 * 1000, reason);
    await logModerationAction({
      guildId: guild.id,
      userId: member.id,
      botAction: true,
      actionType: 'antiraid_timeout',
      reason,
      metadata: summary
    }).catch(() => null);
    return `Timed out ${member} for ${config.timeoutMinutes} minute(s).`;
  }

  if (config.action === 'kick') {
    const manageState = manageabilityState(guild, member);
    if (!manageState.ok) return `Could not kick ${member}: ${manageState.reason}`;

    await member.kick(reason);
    await logModerationAction({
      guildId: guild.id,
      userId: member.id,
      botAction: true,
      actionType: 'antiraid_kick',
      reason,
      metadata: summary
    }).catch(() => null);
    return `Kicked ${member}.`;
  }

  if (config.action === 'jail') {
    const result = await jailMember({
      guild,
      member,
      reason,
      metadata: {
        ...summary,
        source: 'antiraid'
      }
    });

    if (!result.ok) return `Could not jail ${member}: ${result.reason}`;
    return `Jailed ${member}.`;
  }

  if (config.action === 'lock') {
    const locked = await maybeLockVerificationChannel(guild, config, reason).catch((error) => ({
      ok: false,
      reason: error?.message || 'Unknown error'
    }));

    return locked.ok
      ? `Locked ${locked.channel}.`
      : `Could not lock the verification channel: ${locked.reason}`;
  }

  return 'Alerted staff only.';
}

async function shouldBypass(member, config) {
  if (!member || member.user?.bot) return true;
  if (member.id === member.guild.ownerId) return true;
  if (await db.isWhitelisted(member.guild.id, member.id).catch(() => false)) return true;
  if (config.whitelist.includes(member.id)) return true;
  const specificBypass = await probeFakePermission(member.guild.id, member, 'RumiBypassAntiraid');
  const generalBypass = await probeFakePermission(member.guild.id, member, 'RumiBypass');
  if (!specificBypass.ok || !generalBypass.ok) return true;
  if (specificBypass.value || generalBypass.value) return true;
  if (await memberHasPermission(member, 'Administrator')) return true;
  return false;
}

async function handleMemberJoin(member) {
  if (!member?.guild || !member.user) return;

  const protection = await getProtectionSettings(member.guild.id).catch((error) => {
    logger.warn({ error, guildId: member.guild.id }, 'Anti-raid settings could not be loaded');
    return null;
  });

  if (!protection || !isSecuritySystemEnabled(protection, 'antiraid')) return;
  if (await shouldBypass(member, protection.antiraid)) return;

  const thresholds = protection.thresholds.antiRaid;
  const recent = getBucket(member.guild.id, thresholds.windowMs);
  recent.push({
    memberId: member.id,
    joinedAt: Date.now(),
    lowAge: accountAgeDays(member) <= thresholds.lowAccountAgeDays
  });
  buckets.set(member.guild.id, recent);

  const summary = computeConfidence(recent, thresholds);
  if (!summary.confidence) return;

  const metadata = {
    burst: summary.burst,
    lowAgeCount: summary.lowAgeCount,
    windowMs: thresholds.windowMs,
    memberId: member.id,
    action: protection.antiraid.action
  };

  await logSecurityEvent({
    guildId: member.guild.id,
    userId: member.id,
    eventType: SECURITY_EVENT_TYPES.RAID_DETECTED,
    confidence: summary.confidence,
    metadata
  }).catch(() => null);

  const result = await applyRaidAction(member, protection.antiraid, {
    burst: summary.burst,
    lowAgeCount: summary.lowAgeCount,
    confidence: summary.confidence,
    windowSeconds: Math.round(thresholds.windowMs / 1000)
  }).catch((error) => {
    logger.warn({ error, guildId: member.guild.id, userId: member.id }, 'Anti-raid action failed');
    return `Could not apply anti-raid action: ${error?.message || 'Unknown error'}`;
  });

  const lastAlertAt = alerts.get(member.guild.id) || 0;
  if (Date.now() - lastAlertAt < ALERT_COOLDOWN_MS) return;
  alerts.set(member.guild.id, Date.now());

  await sendLog(member.guild, 'antinukeAction', {
    title: 'Anti-raid triggered',
    description: `I detected a join burst and responded in ${member.guild.name}. ${result}`,
    userId: member.id,
    member,
    fields: [
      { name: 'Action', value: protection.antiraid.action, inline: true },
      { name: 'Burst', value: String(summary.burst), inline: true },
      { name: 'New accounts', value: String(summary.lowAgeCount), inline: true }
    ]
  }).catch(() => null);
}

module.exports = {
  handleMemberJoin
};
