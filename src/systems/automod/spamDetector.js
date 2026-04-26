const { TtlMap } = require('../../utils/cooldowns');

const messageBuckets = new TtlMap();
const linkBuckets = new TtlMap();

function normalizeContent(content) {
  return String(content || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
}

function pushToBucket(map, key, value, ttlMs) {
  const bucket = map.get(key) || [];
  const now = Date.now();

  const fresh = bucket.filter((item) => {
    return now - item.timestamp <= ttlMs;
  });

  fresh.push({
    ...value,
    timestamp: now
  });

  map.set(key, fresh, ttlMs);

  return fresh;
}

function analyzeSpam(message, thresholds, linkScan) {
  const userKey = `${message.guild.id}:${message.author.id}`;
  const normalized = normalizeContent(message.content || '');

  const messages = pushToBucket(
    messageBuckets,
    userKey,
    {
      normalized,
      channelId: message.channel.id
    },
    thresholds.repeatedMessageWindowMs
  );

  const repeatedCount = messages.filter((item) => {
    return item.normalized && item.normalized === normalized;
  }).length;

  let linkCount = 0;

  if (linkScan.hasLinks || linkScan.hasInvites) {
    const links = pushToBucket(
      linkBuckets,
      userKey,
      {
        linkCount: linkScan.links.length,
        inviteCount: linkScan.invites.length
      },
      thresholds.linkLimitWindowMs
    );

    linkCount = links.reduce((sum, item) => {
      return sum + item.linkCount + item.inviteCount;
    }, 0);
  }

  return {
    repeatedCount,
    repeatedSpam: repeatedCount >= thresholds.repeatedMessageCount,
    linkCount,
    linkSpam: linkCount >= thresholds.linkLimitCount
  };
}

function resetSpamState() {
  messageBuckets.clear();
  linkBuckets.clear();
}

module.exports = {
  analyzeSpam,
  resetSpamState
};