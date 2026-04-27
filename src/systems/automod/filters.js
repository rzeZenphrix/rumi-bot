const db = require('../../services/database');
const { SECURITY_EVENT_TYPES } = require('../../utils/constants');
const { canModerateMember, isStaffLike } = require('../../utils/permissions');
const { logModerationAction, logSecurityEvent } = require('../logging/auditLog');
const { jailMember } = require('../jail/jailManager');
const { createUserFlag } = require('../flags/flagEngine');
const logger = require('../logging/logger');
const { probeFakePermission } = require('../permissions/fakePermissions');
const { scanLinks } = require('./linkScanner');
const { analyzeSpam } = require('./spamDetector');
const { getProtectionSettings, isSecuritySystemEnabled } = require('../security/protectionConfig');

const BLOCKED_PATTERNS = [
  {
    name: 'self_harm_abuse',
    regex: /\b(kill\s+yourself|kys)\b/i,
    confidence: 75
  },
  {
    name: 'raid_or_nuke_language',
    regex: /\b(raid\s+this|nuke\s+this)\b/i,
    confidence: 70
  }
];

async function handleMessageCreate(message) {
  if (!message.guild) return;
  if (message.author.bot) return;
  if (!message.content) return;

  const settings = await db.getGuildSettings(message.guild.id).catch(() => null);
  const protection = await getProtectionSettings(message.guild.id).catch(() => null);

  if (!settings || !protection || !isSecuritySystemEnabled(protection, 'automod', settings.automod_enabled !== false)) return;
  if (await db.isWhitelisted(message.guild.id, message.author.id).catch(() => false)) return;

  const member =
    message.member ||
    (await message.guild.members.fetch(message.author.id).catch(() => null));

  if (!member) return;
  const specificBypass = await probeFakePermission(message.guild.id, member, 'RumiBypassAutomod');
  const generalBypass = await probeFakePermission(message.guild.id, member, 'RumiBypass');
  if (!specificBypass.ok || !generalBypass.ok) return;
  if (specificBypass.value || generalBypass.value) return;

  const thresholds = settings.thresholds_json?.automod;
  if (!thresholds) return;
  const linkScan = scanLinks(message.content);
  const spam = analyzeSpam(message, thresholds, linkScan);

  const patternHits = BLOCKED_PATTERNS.filter((pattern) => {
    return pattern.regex.test(message.content);
  });

  const mentionCount =
    message.mentions.users.size + message.mentions.roles.size;

  const detections = [];

  if (linkScan.hasInvites) {
    detections.push({
      type: 'discord_invite',
      confidence: 55
    });
  }

  if (spam.linkSpam) {
    detections.push({
      type: 'link_spam',
      confidence: 70
    });
  }

  if (spam.repeatedSpam) {
    detections.push({
      type: 'repeated_message_spam',
      confidence: 70
    });
  }

  if (mentionCount >= thresholds.mentionLimit) {
    detections.push({
      type: 'mention_spam',
      confidence: 80
    });
  }

  for (const hit of patternHits) {
    detections.push({
      type: hit.name,
      confidence: hit.confidence
    });
  }

  if (!detections.length) return;

  const confidence = Math.max(...detections.map((item) => item.confidence));

  const actionReason = `Automod: ${detections
    .map((item) => item.type)
    .join(', ')}`;

  await logSecurityEvent({
    guildId: message.guild.id,
    userId: message.author.id,
    eventType: SECURITY_EVENT_TYPES.AUTOMOD_DETECTED,
    confidence,
    metadata: {
      detections,
      channelId: message.channel.id,
      messageId: message.id,
      mentionCount,
      linkCount: spam.linkCount,
      repeatedCount: spam.repeatedCount
    }
  });

  const messageDeleted = await message.delete().then(() => true).catch((error) => {
    logger.warn(
      {
        error,
        guildId: message.guild.id,
        channelId: message.channel.id,
        messageId: message.id
      },
      'Automod could not delete message'
    );
    return false;
  });

  let timeoutApplied = false;
  let jailApplied = false;

  if (
    !isStaffLike(member) &&
    confidence >= 70 &&
    canModerateMember(message.guild, member)
  ) {
    await member
      .timeout(thresholds.timeoutSeconds * 1000, actionReason)
      .then(() => {
        timeoutApplied = true;
      })
      .catch((error) => {
        logger.warn(
          {
            error,
            guildId: message.guild.id,
            userId: message.author.id
          },
          'Automod timeout failed'
        );
      });
  }

  if (!isStaffLike(member) && confidence >= thresholds.jailConfidence) {
    const jailResult = await jailMember({
      guild: message.guild,
      member,
      reason: actionReason,
      metadata: {
        detections,
        confidence
      }
    }).catch((error) => ({
      ok: false,
      error
    }));

    jailApplied = Boolean(jailResult.ok);
  }

  if (confidence >= thresholds.jailConfidence) {
    await createUserFlag({
      userId: message.author.id,
      guildId: message.guild.id,
      type: 'automod',
      confidence,
      evidence: {
        detections,
        mentionCount,
        linkCount: spam.linkCount,
        repeatedCount: spam.repeatedCount
      },
      sourceAction: jailApplied ? 'automod_jail' : 'automod_delete_timeout'
    }).catch((error) => {
      logger.error(
        {
          error,
          userId: message.author.id
        },
        'Failed to create automod flag'
      );
    });
  }

  await logModerationAction({
    guildId: message.guild.id,
    userId: message.author.id,
    botAction: true,
    actionType: 'automod',
    reason: actionReason,
    metadata: {
      confidence,
      detections,
      messageDeleted,
      timeoutApplied,
      jailApplied
    }
  });
}

module.exports = {
  handleMessageCreate
};
