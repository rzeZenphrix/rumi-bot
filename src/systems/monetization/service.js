const db = require('../../services/database');
const { getPremiumCatalog, mapPlanToLegacyTier } = require('./catalog');

function nowIso() {
  return new Date().toISOString();
}

function normalizeScopeType(scopeType) {
  return scopeType === 'guild' ? 'guild' : 'user';
}

function entitlementTierForPlan(planId, tier = null) {
  const explicit = String(tier || '').trim().toLowerCase();
  if (explicit) return explicit;
  const plan = String(planId || '').trim().toLowerCase();
  if (plan.endsWith('_tier1')) return 'tier1';
  if (plan.endsWith('_tier2')) return 'tier2';
  if (plan.endsWith('_tier3')) return 'tier3';
  return 'base';
}

function isEntitlementActive(row, now = Date.now()) {
  if (!row) return false;
  if (!['active', 'trialing', 'grace_period'].includes(String(row.status || '').toLowerCase())) return false;
  if (row.revoked_at) return false;
  if (row.starts_at && new Date(row.starts_at).getTime() > now) return false;
  if (row.ends_at && new Date(row.ends_at).getTime() <= now) return false;
  return true;
}

function catalogPlanIdsForEntitlement(row) {
  if (!row?.plan_id) return [];

  if (row.scope_type === 'guild' || row.scope_type === 'server') {
    const tier = String(row.tier || 'base').toLowerCase();
    const planIds = ['server_premium_base'];
    if (tier !== 'base' && tier !== 'free') {
      planIds.push(`server_premium_${tier}`);
    }
    return [...new Set(planIds)];
  }

  return [row.plan_id];
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

async function listAllEntitlements(scopeType, scopeId) {
  return db.listPremiumEntitlements(scopeType, scopeId).catch(() => []);
}

async function getPremiumStatus({ userId = null, guildId = null } = {}) {
  const catalog = await getCatalog();
  const userEntitlements = userId ? await listEntitlements('user', userId) : [];
  const guildEntitlements = guildId ? await listEntitlements('guild', guildId) : [];
  const catalogPlanMap = new Map(catalog.plans.map((plan) => [plan.planId, plan]));
  const activePlans = [];
  const seenPlans = new Set();

  for (const row of [...userEntitlements, ...guildEntitlements]) {
    for (const planId of catalogPlanIdsForEntitlement(row)) {
      if (seenPlans.has(planId)) continue;
      const plan = catalogPlanMap.get(planId);
      if (!plan) continue;
      seenPlans.add(planId);
      activePlans.push(plan);
    }
  }

  const seenPerks = new Set();
  const activePerks = [];
  for (const plan of activePlans) {
    for (const perk of plan.perks || []) {
      if (!perk?.id || seenPerks.has(perk.id)) continue;
      seenPerks.add(perk.id);
      activePerks.push(perk);
    }
  }

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

async function grantEntitlement({
  scopeType,
  scopeId,
  planId,
  tier = null,
  billingCycle = 'lifetime',
  provider = 'manual',
  providerRef = null,
  startsAt = null,
  endsAt = null,
  metadata = {}
}) {
  return upsertEntitlement({
    scope_type: normalizeScopeType(scopeType),
    scope_id: scopeId,
    plan_id: planId,
    tier: entitlementTierForPlan(planId, tier),
    provider,
    provider_ref: providerRef || `manual:${scopeType}:${scopeId}:${planId}`,
    billing_cycle: billingCycle,
    status: 'active',
    starts_at: startsAt || nowIso(),
    ends_at: endsAt,
    revoked_at: null,
    cancel_at: null,
    metadata_json: metadata
  });
}

async function revokeEntitlement({
  scopeType,
  scopeId,
  planId,
  tier = null,
  reason = 'manual revoke',
  revokedBy = null
}) {
  const normalizedScope = normalizeScopeType(scopeType);
  const normalizedTier = entitlementTierForPlan(planId, tier);
  const rows = await listAllEntitlements(normalizedScope, scopeId);
  const current = rows.find((row) => row.plan_id === planId && String(row.tier || 'base') === normalizedTier);

  if (!current) {
    const error = new Error('No matching entitlement exists for that scope.');
    error.code = 'ENTITLEMENT_NOT_FOUND';
    throw error;
  }

  return upsertEntitlement({
    ...current,
    status: 'revoked',
    revoked_at: nowIso(),
    metadata_json: {
      ...(current.metadata_json || {}),
      revokedBy,
      revokeReason: reason
    }
  });
}

async function findOrderByReference(reference) {
  const ref = String(reference || '').trim();
  if (!ref) return null;

  const direct = await db.getPremiumOrder(ref).catch(() => null);
  if (direct) return direct;

  const fields = ['support_code', 'receipt_code', 'provider_ref'];
  for (const field of fields) {
    const { data } = await db.runQuery(
      db.supabase
        .from('premium_orders')
        .select('*')
        .eq(field, ref)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      `findOrderByReference:${field}`
    ).catch(() => ({ data: null }));
    if (data) return data;
  }

  return null;
}

async function repairPremiumOrder(reference, scopeType, scopeId, repairedBy = null) {
  const order = await findOrderByReference(reference);
  if (!order) {
    const error = new Error('I could not find a premium order or support code by that reference.');
    error.code = 'ORDER_NOT_FOUND';
    throw error;
  }

  const normalizedScope = normalizeScopeType(scopeType);
  if (order.scope_type !== normalizedScope || String(order.scope_id) !== String(scopeId)) {
    const error = new Error('That order belongs to a different premium scope.');
    error.code = 'ORDER_SCOPE_MISMATCH';
    throw error;
  }

  const entitlement = await grantEntitlement({
    scopeType: normalizedScope,
    scopeId,
    planId: order.plan_id,
    tier: order.metadata_json?.tier || order.tier || null,
    billingCycle: order.billing_cycle || 'lifetime',
    provider: order.provider || 'manual',
    providerRef: order.provider_subscription_id || order.provider_ref || order.support_code || order.id,
    startsAt: order.created_at || nowIso(),
    endsAt: order.ends_at || null,
    metadata: {
      orderId: order.id,
      repairedBy,
      repairSource: reference,
      repairAt: nowIso()
    }
  });

  if (order.support_code) {
    await db.redeemPremiumCode(order.support_code, {
      status: 'redeemed',
      redeemed_by: repairedBy,
      redeemed_scope_type: normalizedScope,
      redeemed_scope_id: scopeId,
      redeemed_at: nowIso(),
      consumed_reason: 'repair',
      auto_consumed_at: null
    }).catch(() => null);
  }

  await db.updatePremiumOrder(order.id, {
    status: 'fulfilled',
    fulfillment_status: 'fulfilled',
    fulfillment_error: null,
    fulfilled_at: nowIso()
  }).catch(() => null);

  return {
    order,
    entitlement
  };
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
    status: 'redeemed',
    consumed_reason: 'manual_redeem',
    auto_consumed_at: null
  });

  return entitlement;
}

function rowOr(row, key) {
  return row ? row[key] : null;
}

module.exports = {
  getCatalog,
  getPremiumStatus,
  listAllEntitlements,
  upsertEntitlement,
  grantEntitlement,
  revokeEntitlement,
  syncLegacyMirror,
  createRedemptionCode,
  redeemCode,
  repairPremiumOrder,
  findOrderByReference,
  isEntitlementActive
};
