const respond = require('../../utils/respond');
const { getPremiumStatus } = require('./service');

const CACHE_TTL_MS = Math.max(5000, Number(process.env.PREMIUM_ACCESS_CACHE_TTL_MS || 15000));
const VOTER_BOOST_MULTIPLIER = Math.max(1, Number(process.env.VOTER_EARN_MULTIPLIER || 1.25));
const PREMIUM_URL = 'https://rumi.rocks/plans';
const cache = new Map();
const SERVER_TIER_LABELS = Object.freeze({
  base: 'Server Premium',
  tier1: 'Server Premium Tier 1',
  tier2: 'Server Premium Tier 2',
  tier3: 'Server Premium Tier 3'
});

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
  const baseAiQueries = 15;
  const userAiQueries = hasUserPremium ? 75 : 0;
  const serverAiQueries = hasServerPremiumBase ? 150 : 0;
  const hasPremiumServerUnlimited = hasServerPremiumBase;
  const hasPremiumUserUnlimited = hasUserPremium;

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
      aiQueriesPerDay: baseAiQueries + userAiQueries + serverAiQueries,
      bookmarkSlots: hasPremiumUserUnlimited ? Number.MAX_SAFE_INTEGER : 75,
      calendarSlots: hasPremiumUserUnlimited ? Number.MAX_SAFE_INTEGER : 75,
      saveGifSlots: hasPremiumUserUnlimited ? Number.MAX_SAFE_INTEGER : 0,
      customCommands: hasPremiumServerUnlimited ? 200 : 30,
      joinRoles: hasPremiumServerUnlimited ? Number.MAX_SAFE_INTEGER : 15,
      roleConnectionParents: hasPremiumServerUnlimited ? Number.MAX_SAFE_INTEGER : 5,
      roleConnectionChildren: hasPremiumServerUnlimited ? Number.MAX_SAFE_INTEGER : 10,
      economyCooldownMinSeconds: hasServerPremiumBase ? 3 : null
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

function normalizeRequirement(requirement) {
  if (!requirement) {
    return {
      scope: 'shared',
      tier: 'base'
    };
  }

  if (typeof requirement === 'string') {
    if (requirement === 'user') return { scope: 'user', tier: 'base' };
    if (requirement === 'server') return { scope: 'server', tier: 'base' };
    if (requirement.startsWith('server:')) {
      return {
        scope: 'server',
        tier: requirement.split(':')[1] || 'base'
      };
    }
    return { scope: 'shared', tier: 'base' };
  }

  return {
    scope: requirement.scope || 'shared',
    tier: requirement.tier || 'base',
    label: requirement.label || null
  };
}

function describeRequirement(requirement) {
  const normalized = normalizeRequirement(requirement);
  if (normalized.label) return normalized.label;
  if (normalized.scope === 'user') return 'User Premium';
  if (normalized.scope === 'server') {
    return SERVER_TIER_LABELS[normalized.tier] || 'Server Premium';
  }
  return 'User Premium or Server Premium';
}

function describeCurrentAccess(access = null) {
  if (!access) return 'No premium access detected yet.';

  const summary = [];
  summary.push(`User Premium: ${access.hasUserPremium ? 'active' : 'inactive'}`);

  if (access.guildId) {
    summary.push(`Server Premium: ${access.hasServerPremiumBase ? access.serverTier : 'inactive'}`);
  }

  if (access.hasVoter) {
    summary.push('Voter perks: active');
  }

  return summary.join(' | ');
}

function meetsRequirement(access, requirement) {
  const normalized = normalizeRequirement(requirement);

  if (!access) return false;

  if (normalized.scope === 'user') {
    return access.hasUserPremium;
  }

  if (normalized.scope === 'server') {
    if (normalized.tier === 'base') return access.hasServerPremiumBase;
    if (normalized.tier === 'tier1') return access.hasServerTier1;
    if (normalized.tier === 'tier2') return access.hasServerTier2;
    if (normalized.tier === 'tier3') return access.hasServerTier3;
    return access.hasServerPremiumBase;
  }

  return access.sharedPremium;
}

function requirementErrorText(feature, requirement) {
  return `${feature} needs ${describeRequirement(requirement)}.`;
}

async function replyPremiumDenied(message, feature, requirement, access = null) {
  const normalized = normalizeRequirement(requirement);
  const title = `${feature} requires premium`;
  const redeemTarget = normalized.scope === 'server'
    ? '`serverpremium redeem <code> <server-id|invite>`'
    : '`userpremium redeem <code>`';

  await respond.reply(message, 'alert', null, {
    mentionUser: false,
    allowTitle: false,
    title,
    description: [
      requirementErrorText(feature, normalized),
      '',
      `Buy a plan: ${PREMIUM_URL}`,
    ].join('\n')
  });
}

async function requirePremium(message, requirement, feature, access = null) {
  const premium = access || await getPremiumAccessForMessage(message);
  if (meetsRequirement(premium, requirement)) return premium;
  await replyPremiumDenied(message, feature, requirement, premium);
  return null;
}

async function requireSharedPremium(message, feature, access = null) {
  return requirePremium(message, { scope: 'shared', tier: 'base' }, feature, access);
}

async function requireUserPremium(message, feature, access = null) {
  return requirePremium(message, { scope: 'user', tier: 'base' }, feature, access);
}

async function requireServerPremium(message, feature, access = null) {
  return requirePremium(message, { scope: 'server', tier: 'base' }, feature, access);
}

async function requireServerTier(message, tier, feature, access = null) {
  return requirePremium(message, { scope: 'server', tier }, feature, access);
}

module.exports = {
  PREMIUM_URL,
  VOTER_BOOST_MULTIPLIER,
  getPremiumAccess,
  getPremiumAccessForMessage,
  invalidatePremiumAccess,
  normalizeRequirement,
  describeRequirement,
  meetsRequirement,
  replyPremiumDenied,
  requirePremium,
  requireSharedPremium,
  requireUserPremium,
  requireServerPremium,
  requireServerTier
};
