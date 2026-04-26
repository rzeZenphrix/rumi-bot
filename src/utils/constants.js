const DEFAULT_THRESHOLDS = Object.freeze({
  antiRaid: {
    windowMs: 60000,
    joinBurst: 8,
    lowAccountAgeDays: 7,
    lowAgeBurst: 4,
    quarantineConfidence: 65,
    lockdownConfidence: 85
  },

  antiNuke: {
    windowMs: 30000,
    channelDelete: 3,
    roleDelete: 3,
    roleUpdate: 5,
    channelUpdate: 8,
    webhookCreate: 5,
    banAdd: 6,
    mitigationConfidence: 70
  },

  automod: {
    repeatedMessageWindowMs: 10000,
    repeatedMessageCount: 4,
    mentionLimit: 8,
    linkLimitWindowMs: 15000,
    linkLimitCount: 4,
    timeoutSeconds: 60,
    jailConfidence: 75
  },

  flags: {
    alertConfidence: 60,
    highRiskScore: 70
  }
});

const SECURITY_EVENT_TYPES = Object.freeze({
  MEMBER_JOIN: 'member_join',
  RAID_DETECTED: 'raid_detected',
  NUKE_ACTION: 'nuke_action',
  NUKE_DETECTED: 'nuke_detected',
  AUTOMOD_DETECTED: 'automod_detected'
});

const DANGEROUS_PERMISSIONS = Object.freeze([
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageWebhooks',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'ManageMessages',
  'MentionEveryone'
]);

module.exports = {
  DEFAULT_THRESHOLDS,
  SECURITY_EVENT_TYPES,
  DANGEROUS_PERMISSIONS
};