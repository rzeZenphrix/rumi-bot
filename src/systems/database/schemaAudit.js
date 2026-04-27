const logger = require('../logging/logger');

const FEATURE_TABLES = Object.freeze({
  core: ['guilds', 'users', 'bot_kv', 'dashboard_sessions'],
  moderation: ['warnings', 'punishment_logs', 'security_events', 'security_whitelist', 'guild_security_configs'],
  customization: ['embed_templates', 'custom_commands', 'fake_permissions'],
  tasks: ['scheduled_tasks', 'todos', 'bookmarks', 'calendar_events'],
  economy: ['economy_accounts', 'economy_transactions', 'economy_guild_settings'],
  social: ['social_profiles'],
  monetization: [
    'premium_plan_catalog',
    'premium_orders',
    'premium_order_events',
    'premium_entitlements',
    'premium_redemption_codes'
  ]
});

let lastAudit = null;
let inFlight = null;

async function probeTable(db, table) {
  const started = Date.now();
  const { error } = await db.supabase
    .from(table)
    .select('*', { count: 'exact', head: true })
    .limit(1);

  return {
    ok: !error,
    latencyMs: Date.now() - started,
    error: error?.message || null
  };
}

async function runSchemaAudit(db, { force = false } = {}) {
  const ttlMs = Math.max(15000, Number(process.env.SCHEMA_AUDIT_TTL_MS || 120000));
  if (!force && lastAudit && Date.now() - lastAudit.generatedAtMs < ttlMs) {
    return lastAudit;
  }

  if (!force && inFlight) return inFlight;

  inFlight = (async () => {
    if (!db?.isConfigured?.()) {
      lastAudit = {
        ok: false,
        configured: false,
        features: {},
        missingFeatures: Object.keys(FEATURE_TABLES),
        generatedAt: new Date().toISOString(),
        generatedAtMs: Date.now()
      };
      return lastAudit;
    }

    const features = {};
    const missingFeatures = [];

    for (const [feature, tables] of Object.entries(FEATURE_TABLES)) {
      const checks = await Promise.all(
        tables.map(async (table) => ({
          table,
          ...(await probeTable(db, table).catch((error) => ({
            ok: false,
            latencyMs: 0,
            error: error?.message || 'Unknown error'
          })))
        }))
      );

      const ok = checks.every((entry) => entry.ok);
      if (!ok) missingFeatures.push(feature);

      features[feature] = {
        ok,
        tables: checks
      };
    }

    lastAudit = {
      ok: missingFeatures.length === 0,
      configured: true,
      features,
      missingFeatures,
      generatedAt: new Date().toISOString(),
      generatedAtMs: Date.now()
    };

    logger.info(
      {
        missingFeatures,
        generatedAt: lastAudit.generatedAt
      },
      'Schema audit completed'
    );

    return lastAudit;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

function getLastSchemaAudit() {
  return lastAudit;
}

function featureReady(feature) {
  return lastAudit?.features?.[feature]?.ok !== false;
}

module.exports = {
  FEATURE_TABLES,
  runSchemaAudit,
  getLastSchemaAudit,
  featureReady
};
