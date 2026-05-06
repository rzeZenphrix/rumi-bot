const crypto = require('node:crypto');

const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+)/i;
const DISCORD_INVITE_REGEX = /(discord\.gg\/|discord\.com\/invite\/|discordapp\.com\/invite\/)/i;

const SUSPICIOUS_NAME_PATTERNS = [
  /raid/i,
  /nuke/i,
  /spam/i,
  /free\s*nitro/i,
  /discord\.gg/i,
  /onlyfans/i,
  /crypto/i,
  /airdrop/i,
  /giveaway/i
];

function now() {
  return Date.now();
}

function clampScore(value) {
  return Math.min(100, Math.max(0, Math.round(Number(value || 0))));
}

function severityFromScore(score) {
  const value = Number(score || 0);

  if (value >= 75) return 'critical';
  if (value >= 50) return 'high';
  if (value >= 25) return 'medium';
  return 'low';
}

function hoursSince(dateLike) {
  const timestamp = dateLike instanceof Date
    ? dateLike.getTime()
    : Number(dateLike || 0);

  if (!timestamp || !Number.isFinite(timestamp)) return null;

  return Math.max(0, (now() - timestamp) / (60 * 60 * 1000));
}

function hasDefaultAvatar(user) {
  if (!user) return false;

  /**
   * Discord users with no custom avatar have avatar === null.
   */
  return !user.avatar;
}

function displayNameOf(member) {
  return (
    member?.displayName ||
    member?.user?.globalName ||
    member?.user?.username ||
    ''
  );
}

function usernameOf(memberOrUser) {
  return (
    memberOrUser?.user?.username ||
    memberOrUser?.username ||
    ''
  );
}

function normalizeName(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function suspiciousNameReasons(member) {
  const reasons = [];
  const username = usernameOf(member);
  const displayName = displayNameOf(member);
  const combined = `${username} ${displayName}`;

  for (const pattern of SUSPICIOUS_NAME_PATTERNS) {
    if (pattern.test(combined)) {
      reasons.push(`Suspicious name pattern: ${pattern.source}`);
    }
  }

  return reasons;
}

function hashText(value = '') {
  return crypto
    .createHash('sha256')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 16);
}

function containsLink(content = '') {
  return URL_REGEX.test(String(content || ''));
}

function containsDiscordInvite(content = '') {
  return DISCORD_INVITE_REGEX.test(String(content || ''));
}

function countMentions(message) {
  return {
    users: message.mentions?.users?.size || 0,
    roles: message.mentions?.roles?.size || 0,
    everyone: message.mentions?.everyone === true,
    total: (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0)
  };
}

function scoreMemberJoin(member, context = {}) {
  const {
    config = {},
    raidModeActive = false,
    inviteCode = null,
    inviteBurst = null,
    duplicateNameCount = 0,
    similarNameCount = 0,
    previousFlags = []
  } = context;

  let score = 0;
  const reasons = [];

  const user = member.user;
  const accountAgeHours = hoursSince(user?.createdTimestamp);
  const configuredFreshHours = Number(config.join?.accountAgeHours || 24);

  if (accountAgeHours !== null) {
    if (accountAgeHours < 1) {
      score += 30;
      reasons.push('Account is younger than 1 hour.');
    } else if (accountAgeHours < 24) {
      score += 20;
      reasons.push('Account is younger than 24 hours.');
    } else if (accountAgeHours < configuredFreshHours) {
      score += 10;
      reasons.push(`Account is younger than configured fresh-account threshold (${configuredFreshHours}h).`);
    }
  }

  if (hasDefaultAvatar(user)) {
    score += 5;
    reasons.push('Account has no custom avatar.');
  }

  const nameReasons = suspiciousNameReasons(member);
  if (nameReasons.length) {
    score += Math.min(25, nameReasons.length * 10);
    reasons.push(...nameReasons);
  }

  if (user?.bot) {
    score += 25;
    reasons.push('Joining account is a bot.');
  }

  if (raidModeActive) {
    score += 20;
    reasons.push('Joined while raid mode is active.');
  }

  if (inviteCode && inviteBurst?.count) {
    if (inviteBurst.count >= Number(config.invite?.singleInviteJoinLimit || 8)) {
      score += 15;
      reasons.push(`Invite ${inviteCode} is being used rapidly (${inviteBurst.count} joins).`);
    }
  }

  if (duplicateNameCount >= 2) {
    score += Math.min(25, duplicateNameCount * 5);
    reasons.push(`Duplicate username/display-name cluster detected (${duplicateNameCount}).`);
  }

  if (similarNameCount >= 3) {
    score += Math.min(20, similarNameCount * 4);
    reasons.push(`Similar username/display-name cluster detected (${similarNameCount}).`);
  }

  if (previousFlags.length) {
    score += Math.min(30, previousFlags.length * 10);
    reasons.push(`User has previous anti-raid flag(s): ${previousFlags.map((flag) => flag.flag_type || flag.flagType).join(', ')}.`);
  }

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    severity: severityFromScore(finalScore),
    reasons,
    accountAgeHours,
    flags: {
      freshAccount: accountAgeHours !== null && accountAgeHours < configuredFreshHours,
      noAvatar: hasDefaultAvatar(user),
      bot: user?.bot === true,
      suspiciousName: nameReasons.length > 0,
      joinedDuringRaidMode: raidModeActive
    }
  };
}

function scoreJoinWave(stats = {}, config = {}) {
  let score = 0;
  const reasons = [];

  const joinLimit = Number(config.join?.limit || 8);
  const botLimit = Number(config.botRaid?.limit || 3);
  const inviteLimit = Number(config.invite?.singleInviteJoinLimit || 8);

  if (stats.totalJoins >= joinLimit) {
    score += 25;
    reasons.push(`Join velocity threshold crossed: ${stats.totalJoins}/${joinLimit}.`);
  }

  if (stats.totalJoins >= joinLimit * 2) {
    score += 20;
    reasons.push('Join velocity is more than double the configured threshold.');
  }

  if (stats.freshAccountRatio >= 0.6 && stats.totalJoins >= 4) {
    score += 25;
    reasons.push(`Fresh-account ratio is high (${Math.round(stats.freshAccountRatio * 100)}%).`);
  }

  if (stats.botJoins >= botLimit) {
    score += 30;
    reasons.push(`Bot-join threshold crossed: ${stats.botJoins}/${botLimit}.`);
  }

  if (stats.botRatio >= 0.3 && stats.totalJoins >= 4) {
    score += 20;
    reasons.push(`Bot ratio is high (${Math.round(stats.botRatio * 100)}%).`);
  }

  if (stats.noAvatarRatio >= 0.7 && stats.totalJoins >= 5) {
    score += 15;
    reasons.push(`No-avatar ratio is high (${Math.round(stats.noAvatarRatio * 100)}%).`);
  }

  if (stats.maxInviteJoins >= inviteLimit) {
    score += 20;
    reasons.push(`One invite is responsible for many joins (${stats.maxInviteJoins}/${inviteLimit}).`);
  }

  if (stats.maxDuplicateNameCount >= 3) {
    score += 15;
    reasons.push(`Duplicate-name cluster detected (${stats.maxDuplicateNameCount}).`);
  }

  if (stats.maxSimilarNameCount >= 4) {
    score += 15;
    reasons.push(`Similar-name cluster detected (${stats.maxSimilarNameCount}).`);
  }

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    severity: severityFromScore(finalScore),
    reasons
  };
}

function scoreMessage(message, context = {}) {
  const {
    config = {},
    memberAgeMinutes = null,
    userMessageCount = 0,
    duplicateCount = 0,
    channelBurstCount = 0,
    crossUserDuplicateCount = 0
  } = context;

  let score = 0;
  const reasons = [];

  const content = String(message.content || '');
  const mentions = countMentions(message);

  const isNewMember = memberAgeMinutes !== null &&
    memberAgeMinutes <= Number(config.message?.newMemberWindowMinutes || 30);

  if (isNewMember) {
    score += 10;
    reasons.push('Message was sent by a new member.');
  }

  if (containsLink(content)) {
    score += isNewMember ? 15 : 8;
    reasons.push('Message contains a link.');
  }

  if (containsDiscordInvite(content)) {
    score += isNewMember ? 25 : 15;
    reasons.push('Message contains a Discord invite.');
  }

  if (mentions.everyone) {
    score += 30;
    reasons.push('Message attempts @everyone or @here mention.');
  }

  if (mentions.total >= Number(config.message?.mentionLimit || 8)) {
    score += 25;
    reasons.push(`Mention threshold crossed (${mentions.total}).`);
  }

  if (userMessageCount >= Number(config.message?.spamLimit || 5)) {
    score += 20;
    reasons.push(`User message spam threshold crossed (${userMessageCount}).`);
  }

  if (duplicateCount >= Number(config.message?.duplicateLimit || 4)) {
    score += 20;
    reasons.push(`Repeated-message threshold crossed (${duplicateCount}).`);
  }

  if (crossUserDuplicateCount >= Number(config.message?.duplicateLimit || 4)) {
    score += 35;
    reasons.push(`Coordinated duplicate-message wave detected (${crossUserDuplicateCount} users).`);
  }

  if (channelBurstCount >= Number(config.message?.spamLimit || 5) * 2) {
    score += 15;
    reasons.push(`Channel message burst detected (${channelBurstCount}).`);
  }

  if (message.attachments?.size >= 3) {
    score += 10;
    reasons.push('Message has many attachments.');
  }

  const finalScore = clampScore(score);

  return {
    score: finalScore,
    severity: severityFromScore(finalScore),
    reasons,
    contentHash: hashText(content),
    flags: {
      newMember: isNewMember,
      hasLink: containsLink(content),
      hasDiscordInvite: containsDiscordInvite(content),
      everyoneMention: mentions.everyone,
      mentionCount: mentions.total
    }
  };
}

module.exports = {
  URL_REGEX,
  DISCORD_INVITE_REGEX,

  clampScore,
  severityFromScore,
  hoursSince,
  hasDefaultAvatar,
  displayNameOf,
  usernameOf,
  normalizeName,
  hashText,
  containsLink,
  containsDiscordInvite,
  countMentions,

  scoreMemberJoin,
  scoreJoinWave,
  scoreMessage
};