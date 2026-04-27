const db = require('../../services/database');
const { getPremiumCatalog, mapPlanToLegacyTier } = require('./catalog');

function nowIso() {
  return new Date().toISOString();
}

function isEntitlementActive(row, now = Date.now()) {
  if (!row) return false;
  if (!['active', 'trialing', 'grace_period'].includes(String(row.status || '').toLowerCase())) return false;
  if (row.revoked_at) return false;
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false;
  return true;
}

async function ensureCatalogSeeded() {
  const catalog = getPremiumCatalog();
  await db.upsertPremiumPlanCatalog(catalog.plans).catch(() => null);
  return catalog;
}

async function getCatalog() {
  await ensureCatalogSeeded().catch(() => null);
  return getPremiumCatalog();
}

async function listEntitlements(scopeType, scopeId) {
  const rows = await db.listPremiumEntitlements(scopeType, scopeId).catch(() => []);
  return rows.filter((row) => isEntitlementActive(row));
}

async function getPremiumStatus({ userId = null, guildId = null } = {}) {
  const catalog = await getCatalog();
  const userEntitlements = userId ? await listEntitlements('user', userId) : [];
  const guildEntitlements = guildId ? await listEntitlements('guild', guildId) : [];

  const activePlanIds = new Set([
    ...userEntitlements.map((row) => row.plan_id),
    ...guildEntitlements.map((row) => row.plan_id)
  ]);

  const activePlans = catalog.plans.filter((plan) => activePlanIds.has(plan.planId));
  const activePerks = catalog.perks.filter((perk) => activePlans.some((plan) => plan.perks.some((entry) => entry.id === perk.id)));

  return {
    ok: true,
    userId,
    guildId,
    activePlans,
    activePerks,
    userEntitlements,
    guildEntitlements,
    checkedAt: nowIso()
  };
}

async function syncLegacyMirror(row) {
  if (!row || row.scope_type !== 'guild' || !row.scope_id) return null;
  const legacyTier = isEntitlementActive(row) ? mapPlanToLegacyTier(row.plan_id) : 'free';

  await Promise.allSettled([
    db.setLegacyPremiumStatus(row.scope_id, legacyTier, row.ends_at, {
      planId: row.plan_id,
      tier: row.tier,
      status: row.status
    }),
    db.setLegacyRumiPlan(row.scope_id, legacyTier, row.ends_at, {
      planId: row.plan_id,
      tier: row.tier,
      status: row.status
    }),
    db.setLegacyGuildPlan(row.scope_id, row.tier || legacyTier)
  ]);

  return legacyTier;
}

async function upsertEntitlement(row) {
  const saved = await db.upsertPremiumEntitlement(row);
  await syncLegacyMirror(saved).catch(() => null);
  return saved;
}

async function createRedemptionCode(row) {
  return db.createPremiumRedemptionCode(row);
}

async function redeemCode(code, scopeType, scopeId, redeemedBy) {
  const entry = await db.getPremiumRedemptionCode(code);
  if (!entry) {
    const error = new Error('That premium code is invalid.');
    error.code = 'INVALID_CODE';
    throw error;
  }

  if (entry.status !== 'ready') {
    const error = new Error('That premium code is no longer available.');
    error.code = 'CODE_NOT_AVAILABLE';
    throw error;
  }

  const now = new Date();
  const startsAt = rowOr(entry, 'starts_at') || now.toISOString();
  const endsAt = entry.ends_at || null;

  const entitlement = await upsertEntitlement({
    scope_type: scopeType,
    scope_id: scopeId,
    plan_id: entry.plan_id,
    tier: entry.tier,
    provider: entry.provider || 'manual',
    provider_ref: entry.code,
    billing_cycle: entry.billing_cycle || 'lifetime',
    status: 'active',
    starts_at: startsAt,
    ends_at: endsAt,
    metadata_json: {
      redemptionCode: entry.code,
      source: 'redeem'
    }
  });

  await db.redeemPremiumCode(entry.code, {
    redeemed_by: redeemedBy,
    redeemed_scope_type: scopeType,
    redeemed_scope_id: scopeId,
    redeemed_at: now.toISOString(),
    status: 'redeemed'
  });

  return entitlement;
}

function rowOr(row, key) {
  return row ? row[key] : null;
}

module.exports = {
  getCatalog,
  getPremiumStatus,
  upsertEntitlement,
  syncLegacyMirror,
  createRedemptionCode,
  redeemCode,
  isEntitlementActive
};
