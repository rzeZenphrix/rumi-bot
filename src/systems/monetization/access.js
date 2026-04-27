const respond = require('../../utils/respond');
const { getPremiumStatus } = require('./service');

const CACHE_TTL_MS = Math.max(5000, Number(process.env.PREMIUM_ACCESS_CACHE_TTL_MS || 15000));
const VOTER_BOOST_MULTIPLIER = Math.max(1, Number(process.env.VOTER_EARN_MULTIPLIER || 1.25));
const cache = new Map();

function cacheKey(userId, guildId) {
  return `${userId || 'anon'}:${guildId || 'dm'}`;
}

function readCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(key, value) {
  cache.set(key, {
    at: Date.now(),
    value
  });
  return value;
}

function highestServerTier(activePlans = []) {
  const tiers = ['free', 'base', 'tier1', 'tier2', 'tier3'];
  let best = 'free';

  for (const plan of activePlans) {
    if (plan.scope !== 'server') continue;
    if (tiers.indexOf(plan.tier) > tiers.indexOf(best)) {
      best = plan.tier;
    }
  }

  return best;
}

function buildAccess(status, userId, guildId) {
  const activePlans = status?.activePlans || [];
  const serverTier = highestServerTier(activePlans);
  const hasUserPremium = activePlans.some((plan) => plan.planId === 'user_premium_base');
  const hasServerPremiumBase = activePlans.some((plan) => plan.scope === 'server');
  const hasVoter = activePlans.some((plan) => plan.planId === 'voter');
  const sharedPremium = hasUserPremium || hasServerPremiumBase;

  return {
    userId,
    guildId,
    status,
    activePlans,
    activePerks: status?.activePerks || [],
    hasVoter,
    hasUserPremium,
    hasServerPremiumBase,
    serverTier,
    hasServerTier1: serverTier === 'tier1' || serverTier === 'tier2' || serverTier === 'tier3',
    hasServerTier2: serverTier === 'tier2' || serverTier === 'tier3',
    hasServerTier3: serverTier === 'tier3',
    sharedPremium,
    limits: {
      aiQueriesPerDay: hasServerPremiumBase ? 30 : hasUserPremium ? 15 : 5,
      bookmarkSlots: hasUserPremium ? 20 : 5,
      calendarSlots: hasUserPremium ? Number.MAX_SAFE_INTEGER : 20,
      saveGifSlots: hasUserPremium ? 50 : 0,
      customCommands: hasServerPremiumBase ? 20 : 7,
      joinRoles: hasServerPremiumBase ? 25 : 10,
      roleConnectionParents: hasServerPremiumBase ? 15 : 5,
      roleConnectionChildren: hasServerPremiumBase ? 15 : 10
    },
    economy: {
      canEditCooldowns: hasServerPremiumBase,
      canDisableVoterBoost: serverTier === 'tier1' || serverTier === 'tier2' || serverTier === 'tier3',
      voterMultiplier: hasVoter ? VOTER_BOOST_MULTIPLIER : 1
    }
  };
}

async function getPremiumAccess({ userId = null, guildId = null } = {}) {
  const key = cacheKey(userId, guildId);
  const cached = readCache(key);
  if (cached) return cached;

  const status = await getPremiumStatus({ userId, guildId });
  return writeCache(key, buildAccess(status, userId, guildId));
}

async function getPremiumAccessForMessage(message) {
  return getPremiumAccess({
    userId: message.author?.id || null,
    guildId: message.guild?.id || null
  });
}

function invalidatePremiumAccess(userId = null, guildId = null) {
  cache.delete(cacheKey(userId, guildId));
}

function sharedPremiumRequiredText(feature) {
  return `${feature} needs user premium or a premium server.`;
}

async function requireSharedPremium(message, feature, access = null) {
  const premium = access || await getPremiumAccessForMessage(message);
  if (premium.sharedPremium) return premium;
  await respond.reply(message, 'bad', sharedPremiumRequiredText(feature));
  return null;
}

async function requireUserPremium(message, feature, access = null) {
  const premium = access || await getPremiumAccessForMessage(message);
  if (premium.hasUserPremium) return premium;
  await respond.reply(message, 'bad', `${feature} needs user premium.`);
  return null;
}

async function requireServerPremium(message, feature, access = null) {
  const premium = access || await getPremiumAccessForMessage(message);
  if (premium.hasServerPremiumBase) return premium;
  await respond.reply(message, 'bad', `${feature} needs server premium in this server.`);
  return null;
}

async function requireServerTier(message, tier, feature, access = null) {
  const premium = access || await getPremiumAccessForMessage(message);
  const allowed =
    (tier === 'tier1' && premium.hasServerTier1) ||
    (tier === 'tier2' && premium.hasServerTier2) ||
    (tier === 'tier3' && premium.hasServerTier3);

  if (allowed) return premium;

  await respond.reply(message, 'bad', `${feature} needs server premium ${tier}.`);
  return null;
}

module.exports = {
  VOTER_BOOST_MULTIPLIER,
  getPremiumAccess,
  getPremiumAccessForMessage,
  invalidatePremiumAccess,
  requireSharedPremium,
  requireUserPremium,
  requireServerPremium,
  requireServerTier
};
