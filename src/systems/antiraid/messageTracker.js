const {
  hashText,
  containsLink,
  containsDiscordInvite,
  countMentions,
  scoreMessage
} = require('./riskScorer');

const guildMessageBuckets = new Map();
const userMessageBuckets = new Map();
const contentBuckets = new Map();
const channelBuckets = new Map();
const webhookBuckets = new Map();

const CLEANUP_INTERVAL_MS = 60_000;
const MAX_AGE_MS = 60 * 60 * 1000;

let lastCleanup = 0;

function now() {
  return Date.now();
}

function userKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function channelKey(guildId, channelId) {
  return `${guildId}:${channelId}`;
}

function contentKey(guildId, contentHash) {
  return `${guildId}:${contentHash}`;
}

function webhookKey(guildId, webhookId) {
  return `${guildId}:${webhookId || 'none'}`;
}

function cleanupMap(map, current) {
  for (const [key, events] of map.entries()) {
    const recent = events.filter((event) => current - event.at <= MAX_AGE_MS);
    if (recent.length) map.set(key, recent);
    else map.delete(key);
  }
}

function cleanup() {
  const current = now();

  if (current - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = current;

  cleanupMap(guildMessageBuckets, current);
  cleanupMap(userMessageBuckets, current);
  cleanupMap(contentBuckets, current);
  cleanupMap(channelBuckets, current);
  cleanupMap(webhookBuckets, current);
}

function getRecent(map, key, windowSeconds) {
  cleanup();

  const current = now();
  const cutoff = current - Number(windowSeconds || 10) * 1000;

  return (map.get(key) || []).filter((event) => event.at >= cutoff);
}

function memberAgeMinutes(member) {
  const joined = member?.joinedTimestamp;
  if (!joined) return null;
  return Math.max(0, (now() - joined) / 60000);
}

function normalizeMessageContent(content = '') {
  return String(content || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/www\.\S+/g, '[url]')
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function pushBucket(map, key, event) {
  const events = map.get(key) || [];
  events.push(event);
  map.set(key, events);
}

function recordMessage(message, options = {}) {
  cleanup();

  const { config = {} } = options;

  if (!message.guild || !message.author) {
    return {
      ignored: true,
      reason: 'No guild or author.'
    };
  }

  /**
   * Ignore normal bot messages, but allow webhook messages.
   */
  if (message.author.bot && !message.webhookId) {
    return {
      ignored: true,
      reason: 'Bot author.'
    };
  }

  const guildId = message.guild.id;
  const userId = message.author.id;
  const channelId = message.channel?.id;

  const normalized = normalizeMessageContent(message.content || '');
  const contentHash = hashText(normalized);
  const mentions = countMentions(message);
  const ageMinutes = memberAgeMinutes(message.member);

  const event = {
    at: now(),

    guildId,
    userId,
    channelId,
    webhookId: message.webhookId || null,

    messageId: message.id,

    content: message.content || '',
    normalized,
    contentHash,

    hasLink: containsLink(message.content || ''),
    hasDiscordInvite: containsDiscordInvite(message.content || ''),

    mentions,

    attachmentCount: message.attachments?.size || 0,

    memberAgeMinutes: ageMinutes,
    fromWebhook: Boolean(message.webhookId)
  };

  pushBucket(guildMessageBuckets, guildId, event);
  pushBucket(userMessageBuckets, userKey(guildId, userId), event);
  pushBucket(contentBuckets, contentKey(guildId, contentHash), event);
  pushBucket(channelBuckets, channelKey(guildId, channelId), event);

  if (message.webhookId) {
    pushBucket(webhookBuckets, webhookKey(guildId, message.webhookId), event);
  }

  const spamWindow = config.message?.spamWindowSeconds || 8;
  const webhookWindow = config.webhook?.windowSeconds || spamWindow;

  const recentUserEvents = getRecent(userMessageBuckets, userKey(guildId, userId), spamWindow);
  const recentDuplicateEvents = getRecent(contentBuckets, contentKey(guildId, contentHash), spamWindow);
  const recentChannelEvents = getRecent(channelBuckets, channelKey(guildId, channelId), spamWindow);
  const recentWebhookEvents = message.webhookId
    ? getRecent(webhookBuckets, webhookKey(guildId, message.webhookId), webhookWindow)
    : [];

  const uniqueUsersForDuplicate = new Set(recentDuplicateEvents.map((item) => item.userId));

  const linkEvents = recentUserEvents.filter((item) => item.hasLink);
  const inviteEvents = recentUserEvents.filter((item) => item.hasDiscordInvite);

  const score = scoreMessage(message, {
    config,
    memberAgeMinutes: ageMinutes,
    userMessageCount: recentUserEvents.length,
    duplicateCount: recentDuplicateEvents.filter((item) => item.userId === userId).length,
    channelBurstCount: recentChannelEvents.length,
    crossUserDuplicateCount: uniqueUsersForDuplicate.size
  });

  const triggered = {
    spam: recentUserEvents.length >= Number(config.message?.spamLimit || 5),
    mentions: mentions.total >= Number(config.message?.mentionLimit || 8) || mentions.everyone,
    links: linkEvents.length >= Number(config.message?.linkLimit || 3),
    invites: inviteEvents.length > 0 && linkEvents.length >= Number(config.message?.linkLimit || 3),
    duplicate: recentDuplicateEvents.length >= Number(config.message?.duplicateLimit || 4),
    coordinatedDuplicate: uniqueUsersForDuplicate.size >= Number(config.message?.duplicateLimit || 4),
    webhook: Boolean(message.webhookId) &&
      recentWebhookEvents.length >= Number(config.webhook?.messageLimit || 5),
    messageRisk: score.score >= 50
  };

  return {
    ignored: false,
    event,

    recentUserEvents,
    recentDuplicateEvents,
    recentChannelEvents,
    recentWebhookEvents,

    counts: {
      userMessages: recentUserEvents.length,
      duplicateMessages: recentDuplicateEvents.length,
      channelMessages: recentChannelEvents.length,
      webhookMessages: recentWebhookEvents.length,
      uniqueDuplicateUsers: uniqueUsersForDuplicate.size,
      userLinks: linkEvents.length,
      userInvites: inviteEvents.length,
      mentions: mentions.total
    },

    risk: score,
    triggered
  };
}

function getUserMessageStats(guildId, userId, windowSeconds = 8) {
  const events = getRecent(userMessageBuckets, userKey(guildId, userId), windowSeconds);

  return {
    total: events.length,
    links: events.filter((event) => event.hasLink).length,
    invites: events.filter((event) => event.hasDiscordInvite).length,
    mentions: events.reduce((total, event) => total + Number(event.mentions?.total || 0), 0),
    events
  };
}

function resetGuildMessages(guildId) {
  guildMessageBuckets.delete(guildId);

  for (const key of userMessageBuckets.keys()) {
    if (key.startsWith(`${guildId}:`)) userMessageBuckets.delete(key);
  }

  for (const key of contentBuckets.keys()) {
    if (key.startsWith(`${guildId}:`)) contentBuckets.delete(key);
  }

  for (const key of channelBuckets.keys()) {
    if (key.startsWith(`${guildId}:`)) channelBuckets.delete(key);
  }

  for (const key of webhookBuckets.keys()) {
    if (key.startsWith(`${guildId}:`)) webhookBuckets.delete(key);
  }
}

module.exports = {
  recordMessage,
  getUserMessageStats,
  resetGuildMessages,
  normalizeMessageContent
};