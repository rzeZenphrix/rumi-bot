const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_THRESHOLDS } = require('../../utils/constants');
const logger = require('../../systems/logging/logger');
const breaker = require('../../systems/database/circuitBreaker');
const { classifyNetworkError, redactSecretText } = require('../../systems/network/errorClassifier');

const url = process.env.SUPABASE_URL || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';
const guildSettingsCache = new Map();
const fakePermissionCache = new Map();
const LOG_THROTTLE_MS = Math.max(5000, Number(process.env.DB_LOG_THROTTLE_MS || 30000));
const GUILD_SETTINGS_CACHE_TTL_MS = Math.max(5000, Number(process.env.GUILD_SETTINGS_CACHE_TTL_MS || 15000));
const FAKE_PERMISSION_CACHE_TTL_MS = Math.max(5000, Number(process.env.FAKE_PERMISSION_CACHE_TTL_MS || 15000));
const logThrottle = new Map();

class DatabaseUnavailableError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'DatabaseUnavailableError';
    this.code = options.code || 'DATABASE_UNAVAILABLE';
    this.details = options.details || null;
    this.retryable = options.retryable !== false;
  }
}

function cloneValue(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getCache(map, key, ttlMs, { allowStale = false } = {}) {
  const entry = map.get(key);
  if (!entry) return null;
  if (allowStale || Date.now() - entry.at <= ttlMs) {
    return cloneValue(entry.value);
  }
  map.delete(key);
  return null;
}

function setCache(map, key, value) {
  map.set(key, {
    value: cloneValue(value),
    at: Date.now()
  });
  return value;
}

function logThrottled(level, key, payload, message) {
  const now = Date.now();
  const last = logThrottle.get(key) || 0;
  if (now - last < LOG_THROTTLE_MS) return;
  logThrottle.set(key, now);
  logger[level]?.(payload, message);
}

function isSupabaseConfigured() {
  return Boolean(!getSupabaseConfigIssue());
}

function getSupabaseConfigIssue() {
  if (!url || !key) return 'Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.';

  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return 'SUPABASE_URL must start with https:// or http://.';
    }
  } catch (_error) {
    return 'SUPABASE_URL is not a valid URL.';
  }

  return null;
}

function createUnavailableSupabase(reason) {
  return new Proxy({}, {
    get(_target, prop) {
      if (prop === 'isUnavailableProxy') return true;
      if (prop === 'from') {
        return () => {
          throw new DatabaseUnavailableError(reason, { code: 'SUPABASE_NOT_CONFIGURED', retryable: false });
        };
      }
      return undefined;
    }
  });
}

const supabase = isSupabaseConfigured()
  ? createClient(url, key, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false
      },
      global: {
        fetch: (...args) => {
          const controller = new AbortController();
          const timeout = setTimeout(
            () => controller.abort(),
            Number(process.env.SUPABASE_FETCH_TIMEOUT_MS || 15000)
          );

          return fetch(args[0], { ...args[1], signal: controller.signal })
            .finally(() => clearTimeout(timeout));
        }
      }
    })
  : createUnavailableSupabase('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');

const supabaseConfigIssue = getSupabaseConfigIssue();

if (supabaseConfigIssue) {
  logger.warn(
    { reason: supabaseConfigIssue },
    'Supabase is unavailable; database-backed features are disabled until configuration is fixed.'
  );
}

function databaseDisabledError(context = 'database') {
  const state = breaker.getState();
  return new DatabaseUnavailableError(
    `Database is temporarily unavailable for ${context}.`,
    { code: 'DATABASE_CIRCUIT_OPEN', details: state, retryable: true }
  );
}

function assertDatabaseReady(context = 'database') {
  const configIssue = getSupabaseConfigIssue();

  if (configIssue) {
    throw new DatabaseUnavailableError(
      configIssue,
      { code: 'SUPABASE_NOT_CONFIGURED', retryable: false }
    );
  }

  if (breaker.isOpen()) {
    throw databaseDisabledError(context);
  }
}

async function executeQuery(query, context) {
  assertDatabaseReady(context);

  try {
    const result = await query;

    if (result?.error) {
      const classified = classifyNetworkError(result.error);
      result.error.context = context;
      result.error.classification = classified.type;

      if (classified.retryable) breaker.recordFailure(result.error);
      throw result.error;
    }

    breaker.recordSuccess();
    return result;
  } catch (error) {
    const classified = classifyNetworkError(error);
    if (classified.retryable) breaker.recordFailure(error);

    logThrottled(
      'warn',
      `db:${context}:${classified.type}`,
      {
        context,
        classification: classified.type,
        retryable: classified.retryable,
        message: redactSecretText(error?.message || error)
      },
      'Database operation failed'
    );

    throw error;
  }
}

function hasDatabaseConfigured() {
  return isSupabaseConfigured();
}

function mergeThresholds(custom = {}) {
  const safeCustom = custom || {};

  return {
    antiRaid: {
      ...DEFAULT_THRESHOLDS.antiRaid,
      ...(safeCustom.antiRaid || {})
    },
    antiNuke: {
      ...DEFAULT_THRESHOLDS.antiNuke,
      ...(safeCustom.antiNuke || {})
    },
    automod: {
      ...DEFAULT_THRESHOLDS.automod,
      ...(safeCustom.automod || {})
    },
    flags: {
      ...DEFAULT_THRESHOLDS.flags,
      ...(safeCustom.flags || {})
    }
  };
}

async function requireData(query, context) {
  const { data } = await executeQuery(query, context);
  return data;
}

async function upsertGuild(guildId, patch = {}) {
  return requireData(
    supabase
      .from('guilds')
      .upsert(
        {
          guild_id: guildId,
          prefix: process.env.DEFAULT_PREFIX || ',',
          automod_enabled: false,
          jail_enabled: false,
          thresholds_json: DEFAULT_THRESHOLDS,
          ...patch
        },
        { onConflict: 'guild_id' }
      )
      .select()
      .single(),
    'upsertGuild'
  );
}

async function getGuildSettings(guildId) {
  const fresh = getCache(guildSettingsCache, guildId, GUILD_SETTINGS_CACHE_TTL_MS);
  if (fresh) return fresh;

  try {
    const { data } = await executeQuery(
      supabase
        .from('guilds')
        .select('*')
        .eq('guild_id', guildId)
        .maybeSingle(),
      'getGuildSettings'
    );

    const normalized = data
      ? {
          ...data,
          prefix: data.prefix || process.env.DEFAULT_PREFIX || '!',
          thresholds_json: mergeThresholds(data.thresholds_json || {})
        }
      : await upsertGuild(guildId);

    setCache(guildSettingsCache, guildId, normalized);
    return normalized;
  } catch (error) {
    const fallback = getCache(guildSettingsCache, guildId, GUILD_SETTINGS_CACHE_TTL_MS, { allowStale: true });
    if (fallback) {
      logThrottled(
        'warn',
        `db:getGuildSettings:cache:${guildId}`,
        { guildId, message: redactSecretText(error?.message || error) },
        'Using cached guild settings after database failure'
      );
      return fallback;
    }
    throw error;
  }
}

async function updateGuildSettings(guildId, patch) {
  const data = await requireData(
    supabase
      .from('guilds')
      .update(patch)
      .eq('guild_id', guildId)
      .select()
      .single(),
    'updateGuildSettings'
  );
  setCache(guildSettingsCache, guildId, {
    ...data,
    prefix: data.prefix || process.env.DEFAULT_PREFIX || '!',
    thresholds_json: mergeThresholds(data.thresholds_json || {})
  });
  return data;
}

async function upsertGuildSecurityConfig(guildId, patch = {}) {
  const data = await requireData(
    supabase
      .from('guild_security_configs')
      .upsert(
        {
          guild_id: guildId,
          security_json: { enabled: false },
          antinuke_json: {},
          antiraid_json: {},
          thresholds_json: DEFAULT_THRESHOLDS,
          ...patch
        },
        { onConflict: 'guild_id' }
      )
      .select()
      .single(),
    'upsertGuildSecurityConfig'
  );

  return {
    ...data,
    thresholds_json: mergeThresholds(data.thresholds_json || {})
  };
}

async function getGuildSecurityConfig(guildId) {
  const { data } = await executeQuery(
    supabase
      .from('guild_security_configs')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle(),
    'getGuildSecurityConfig'
  );

  if (data) {
    return {
      ...data,
      thresholds_json: mergeThresholds(data.thresholds_json || {})
    };
  }

  const legacy = await getGuildSettings(guildId);
  return upsertGuildSecurityConfig(guildId, {
    security_json: legacy.settings_json?.security || { enabled: false },
    antinuke_json: legacy.settings_json?.antinuke || {},
    antiraid_json: legacy.settings_json?.antiraid || {},
    thresholds_json: legacy.thresholds_json || DEFAULT_THRESHOLDS
  });
}

async function updateGuildSecurityConfig(guildId, patchOrUpdater) {
  const current = await getGuildSecurityConfig(guildId);
  const next = typeof patchOrUpdater === 'function'
    ? (await patchOrUpdater(cloneValue(current))) || current
    : {
        ...current,
        ...(patchOrUpdater || {})
      };

  const saved = await upsertGuildSecurityConfig(guildId, {
    security_json: next.security_json || current.security_json || { enabled: false },
    antinuke_json: next.antinuke_json || current.antinuke_json || {},
    antiraid_json: next.antiraid_json || current.antiraid_json || {},
    thresholds_json: mergeThresholds(next.thresholds_json || current.thresholds_json || DEFAULT_THRESHOLDS)
  });

  const guild = await getGuildSettings(guildId);
  await updateGuildSettings(guildId, {
    settings_json: {
      ...(guild.settings_json || {}),
      security: saved.security_json || { enabled: false },
      antinuke: saved.antinuke_json || {},
      antiraid: saved.antiraid_json || {}
    },
    thresholds_json: saved.thresholds_json || guild.thresholds_json || DEFAULT_THRESHOLDS
  });

  return saved;
}

async function setGuildPrefix(guildId, prefix) {
  return updateGuildSettings(guildId, { prefix });
}

async function resetGuildPrefix(guildId) {
  return updateGuildSettings(guildId, {
    prefix: process.env.DEFAULT_PREFIX || ','
  });
}

async function getUserPrefix(userId) {
  const { data } = await executeQuery(
    supabase
      .from('user_prefixes')
      .select('prefix')
      .eq('user_id', userId)
      .maybeSingle(),
    'getUserPrefix'
  );

  return data?.prefix || null;
}

async function setUserPrefix(userId, prefix) {
  return requireData(
    supabase
      .from('user_prefixes')
      .upsert(
        {
          user_id: userId,
          prefix
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single(),
    'setUserPrefix'
  );
}

async function resetUserPrefix(userId) {
  return requireData(
    supabase
      .from('user_prefixes')
      .delete()
      .eq('user_id', userId)
      .select(),
    'resetUserPrefix'
  );
}

async function upsertUser(userId, patch = {}) {
  return requireData(
    supabase
      .from('users')
      .upsert(
        {
          user_id: userId,
          ...patch
        },
        { onConflict: 'user_id' }
      )
      .select()
      .single(),
    'upsertUser'
  );
}

async function getUser(userId) {
  const { data } = await executeQuery(
    supabase
      .from('users')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle(),
    'getUser'
  );

  return data;
}

async function createFlag(flag) {
  await upsertUser(flag.user_id);

  return requireData(
    supabase
      .from('flags')
      .insert(flag)
      .select()
      .single(),
    'createFlag'
  );
}

async function getUserFlags(userId, options = {}) {
  const minConfidence = options.minConfidence || 0;
  const limit = options.limit || 25;

  return requireData(
    supabase
      .from('flags')
      .select('*')
      .eq('user_id', userId)
      .gte('confidence', minConfidence)
      .order('created_at', { ascending: false })
      .limit(limit),
    'getUserFlags'
  );
}

async function pardonUserFlags(userId, guildId = null) {
  let query = supabase
    .from('flags')
    .update({ resolved: true })
    .eq('user_id', userId);

  if (guildId) query = query.eq('guild_id', guildId);

  return requireData(
    query.select(),
    'pardonUserFlags'
  );
}

async function deleteUserFlags(userId, guildId = null) {
  let query = supabase
    .from('flags')
    .delete()
    .eq('user_id', userId);

  if (guildId) query = query.eq('guild_id', guildId);

  return requireData(
    query.select(),
    'deleteUserFlags'
  );
}

async function updateUserRisk(userId, riskScore) {
  return upsertUser(userId, {
    global_risk_score: Math.max(0, Math.min(100, Math.round(riskScore)))
  });
}

async function insertPunishmentLog(row) {
  return requireData(
    supabase
      .from('punishment_logs')
      .insert(row)
      .select()
      .single(),
    'insertPunishmentLog'
  );
}

async function insertSecurityEvent(row) {
  return requireData(
    supabase
      .from('security_events')
      .insert(row)
      .select()
      .single(),
    'insertSecurityEvent'
  );
}

async function getRecentSecurityEvents(options) {
  let query = supabase
    .from('security_events')
    .select('*')
    .eq('guild_id', options.guildId)
    .gte('created_at', options.since.toISOString())
    .order('created_at', { ascending: false })
    .limit(options.limit || 100);

  if (options.eventType) query = query.eq('event_type', options.eventType);
  if (options.actorId) query = query.eq('actor_id', options.actorId);
  if (options.userId) query = query.eq('user_id', options.userId);

  return requireData(query, 'getRecentSecurityEvents');
}

async function createJailRecord(row) {
  return requireData(
    supabase
      .from('jail_records')
      .insert(row)
      .select()
      .single(),
    'createJailRecord'
  );
}

async function getActiveJailRecord(guildId, userId) {
  const { data } = await executeQuery(
    supabase
      .from('jail_records')
      .select('*')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .eq('active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'getActiveJailRecord'
  );

  return data;
}

async function releaseJailRecord(guildId, userId) {
  return requireData(
    supabase
      .from('jail_records')
      .update({
        active: false,
        released_at: new Date().toISOString()
      })
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .eq('active', true)
      .select(),
    'releaseJailRecord'
  );
}

async function isWhitelisted(guildId, userId) {
  const { data } = await executeQuery(
    supabase
      .from('security_whitelist')
      .select('user_id')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .maybeSingle(),
    'isWhitelisted'
  );

  return Boolean(data);
}

async function addWhitelist(guildId, userId, reason = 'Trusted by server staff', addedBy = null) {
  return requireData(
    supabase
      .from('security_whitelist')
      .upsert(
        {
          guild_id: guildId,
          user_id: userId,
          reason,
          added_by: addedBy
        },
        { onConflict: 'guild_id,user_id' }
      )
      .select()
      .single(),
    'addWhitelist'
  );
}

async function removeWhitelist(guildId, userId) {
  return requireData(
    supabase
      .from('security_whitelist')
      .delete()
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .select(),
    'removeWhitelist'
  );
}

async function listWhitelist(guildId, limit = 25) {
  return requireData(
    supabase
      .from('security_whitelist')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: false })
      .limit(limit),
    'listWhitelist'
  );
}

async function createWarning(row) {
  return requireData(
    supabase
      .from('warnings')
      .insert(row)
      .select()
      .single(),
    'createWarning'
  );
}

async function getWarnings(guildId, userId, limit = 10) {
  return requireData(
    supabase
      .from('warnings')
      .select('*')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit),
    'getWarnings'
  );
}

async function deleteWarning(guildId, warningId) {
  return requireData(
    supabase
      .from('warnings')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', warningId)
      .select(),
    'deleteWarning'
  );
}

async function clearWarnings(guildId, userId) {
  return requireData(
    supabase
      .from('warnings')
      .delete()
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .select(),
    'clearWarnings'
  );
}

async function insertSnapshot(row) {
  return requireData(
    supabase
      .from('security_snapshots')
      .insert({
        restored: false,
        ...row
      })
      .select()
      .single(),
    'insertSnapshot'
  );
}

async function getLatestSnapshot(guildId, snapshotType, options = {}) {
  let query = supabase
    .from('security_snapshots')
    .select('*')
    .eq('guild_id', guildId)
    .eq('snapshot_type', snapshotType)
    .order('created_at', { ascending: false })
    .limit(1);

  if (options.unrestoredOnly !== false) {
    query = query.eq('restored', false);
  }

  const { data } = await executeQuery(query.maybeSingle(), 'getLatestSnapshot');

  return data || null;
}

async function markSnapshotRestored(snapshotId) {
  return requireData(
    supabase
      .from('security_snapshots')
      .update({
        restored: true,
        restored_at: new Date().toISOString()
      })
      .eq('id', snapshotId)
      .select()
      .single(),
    'markSnapshotRestored'
  );
}


async function dbHealthCheck() {
  const started = Date.now();

  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      configured: false,
      latencyMs: Date.now() - started,
      error: getSupabaseConfigIssue() || 'Supabase is not configured'
    };
  }

  if (breaker.isOpen()) {
    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - started,
      error: 'Database circuit breaker is open',
      circuit: breaker.getState()
    };
  }

  try {
    await executeQuery(supabase.from('guilds').select('guild_id').limit(1), 'dbHealthCheck');

    return {
      ok: true,
      configured: true,
      latencyMs: Date.now() - started,
      error: null
    };
  } catch (error) {
    const classified = classifyNetworkError(error);

    return {
      ok: false,
      configured: true,
      latencyMs: Date.now() - started,
      error: classified.userMessage,
      classification: classified.type
    };
  }
}

async function getKv(namespace, key, fallback = null) {
  try {
    const { data } = await executeQuery(
      supabase
        .from('bot_kv')
        .select('value')
        .eq('namespace', namespace)
        .eq('key', key)
        .maybeSingle(),
      'getKv'
    );

    return data ? data.value : fallback;
  } catch (error) {
    logger.warn(
      { namespace, key, message: redactSecretText(error?.message || error) },
      'KV read failed; using fallback'
    );
    return fallback;
  }
}

async function setKv(namespace, key, value) {
  return requireData(
    supabase
      .from('bot_kv')
      .upsert(
        {
          namespace,
          key,
          value,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'namespace,key' }
      )
      .select()
      .single(),
    'setKv'
  );
}

async function deleteKv(namespace, key) {
  return requireData(
    supabase
      .from('bot_kv')
      .delete()
      .eq('namespace', namespace)
      .eq('key', key)
      .select(),
    'deleteKv'
  );
}

async function listKv(namespace, limit = 100) {
  return requireData(
    supabase
      .from('bot_kv')
      .select('*')
      .eq('namespace', namespace)
      .order('updated_at', { ascending: false })
      .limit(limit),
    'listKv'
  );
}

async function upsertFakePermission(row) {
  return requireData(
    supabase
      .from('fake_permissions')
      .upsert(row, { onConflict: 'guild_id,subject_type,subject_id,permission' })
      .select()
      .single(),
    'upsertFakePermission'
  );
}

async function removeFakePermission(guildId, subjectType, subjectId, permission) {
  return requireData(
    supabase
      .from('fake_permissions')
      .delete()
      .eq('guild_id', guildId)
      .eq('subject_type', subjectType)
      .eq('subject_id', subjectId)
      .eq('permission', permission)
      .select(),
    'removeFakePermission'
  );
}

async function listFakePermissions(guildId) {
  return requireData(
    supabase
      .from('fake_permissions')
      .select('*')
      .eq('guild_id', guildId)
      .eq('enabled', true)
      .order('created_at', { ascending: false }),
    'listFakePermissions'
  );
}

async function hasFakePermission(guildId, member, permission) {
  if (!guildId || !member || !permission) return false;

  const roleIds = member.roles?.cache ? [...member.roles.cache.keys()] : [];
  const cacheKey = `${guildId}:${member.id}:${permission}:${roleIds.sort().join(',')}`;
  const fresh = getCache(fakePermissionCache, cacheKey, FAKE_PERMISSION_CACHE_TTL_MS);
  if (fresh !== null) return fresh;

  let query = supabase
    .from('fake_permissions')
    .select('id')
    .eq('guild_id', guildId)
    .eq('permission', permission.toString())
    .eq('enabled', true)
    .limit(1);

  const orParts = [`and(subject_type.eq.user,subject_id.eq.${member.id})`];

  for (const roleId of roleIds) {
    orParts.push(`and(subject_type.eq.role,subject_id.eq.${roleId})`);
  }

  try {
    const { data } = await executeQuery(query.or(orParts.join(',')), 'hasFakePermission');
    const allowed = Boolean(data?.length);
    setCache(fakePermissionCache, cacheKey, allowed);
    return allowed;
  } catch (error) {
    const fallback = getCache(fakePermissionCache, cacheKey, FAKE_PERMISSION_CACHE_TTL_MS, { allowStale: true });
    if (fallback !== null) {
      logThrottled(
        'warn',
        `db:hasFakePermission:cache:${guildId}`,
        { guildId, userId: member.id, permission, message: redactSecretText(error?.message || error) },
        'Using cached fake permission result after database failure'
      );
      return fallback;
    }
    throw error;
  }
}

async function saveEmbedTemplate(guildId, name, script, createdBy = null) {
  return requireData(
    supabase
      .from('embed_templates')
      .upsert(
        { guild_id: guildId, name: name.toLowerCase(), script, created_by: createdBy },
        { onConflict: 'guild_id,name' }
      )
      .select()
      .single(),
    'saveEmbedTemplate'
  );
}

async function getEmbedTemplate(guildId, name) {
  const { data } = await executeQuery(
    supabase
      .from('embed_templates')
      .select('*')
      .eq('guild_id', guildId)
      .eq('name', name.toLowerCase())
      .maybeSingle(),
    'getEmbedTemplate'
  );
  return data;
}

async function listEmbedTemplates(guildId, limit = 25) {
  return requireData(
    supabase
      .from('embed_templates')
      .select('name,created_by,updated_at')
      .eq('guild_id', guildId)
      .order('updated_at', { ascending: false })
      .limit(limit),
    'listEmbedTemplates'
  );
}

async function deleteEmbedTemplate(guildId, name) {
  return requireData(
    supabase
      .from('embed_templates')
      .delete()
      .eq('guild_id', guildId)
      .eq('name', name.toLowerCase())
      .select(),
    'deleteEmbedTemplate'
  );
}

async function saveCustomCommand(guildId, name, script, createdBy = null) {
  return requireData(
    supabase
      .from('custom_commands')
      .upsert(
        { guild_id: guildId, name: name.toLowerCase(), script, enabled: true, created_by: createdBy },
        { onConflict: 'guild_id,name' }
      )
      .select()
      .single(),
    'saveCustomCommand'
  );
}

async function getCustomCommand(guildId, name) {
  const { data } = await executeQuery(
    supabase
      .from('custom_commands')
      .select('*')
      .eq('guild_id', guildId)
      .eq('name', name.toLowerCase())
      .eq('enabled', true)
      .maybeSingle(),
    'getCustomCommand'
  );
  return data;
}

async function listDueScheduledTasks(taskType, nowIso = new Date().toISOString(), limit = 10) {
  return requireData(
    supabase
      .from('scheduled_tasks')
      .select('*')
      .eq('task_type', taskType)
      .is('completed_at', null)
      .lte('run_at', nowIso)
      .limit(limit),
    'listDueScheduledTasks'
  );
}

async function createScheduledTask(row) {
  return requireData(
    supabase
      .from('scheduled_tasks')
      .insert(row)
      .select()
      .single(),
    'createScheduledTask'
  );
}

async function completeScheduledTask(taskId) {
  return requireData(
    supabase
      .from('scheduled_tasks')
      .update({ completed_at: new Date().toISOString() })
      .eq('id', taskId)
      .select(),
    'completeScheduledTask'
  );
}

async function listCustomCommands(guildId, limit = 50) {
  return requireData(
    supabase
      .from('custom_commands')
      .select('name,enabled,created_by,updated_at')
      .eq('guild_id', guildId)
      .order('updated_at', { ascending: false })
      .limit(limit),
    'listCustomCommands'
  );
}

async function deleteCustomCommand(guildId, name) {
  return requireData(
    supabase
      .from('custom_commands')
      .delete()
      .eq('guild_id', guildId)
      .eq('name', name.toLowerCase())
      .select(),
    'deleteCustomCommand'
  );
}

async function createDashboardSession(row) {
  return requireData(
    supabase
      .from('dashboard_sessions')
      .insert(row)
      .select()
      .single(),
    'createDashboardSession'
  );
}

async function getDashboardSessionByTokenHash(tokenHash) {
  const { data } = await executeQuery(
    supabase
      .from('dashboard_sessions')
      .select('*')
      .eq('token_hash', tokenHash)
      .gt('expires_at', new Date().toISOString())
      .maybeSingle(),
    'getDashboardSessionByTokenHash'
  );

  return data;
}

async function touchDashboardSession(sessionId) {
  return requireData(
    supabase
      .from('dashboard_sessions')
      .update({ used_at: new Date().toISOString() })
      .eq('id', sessionId)
      .select(),
    'touchDashboardSession'
  );
}

async function addTodo(row) {
  return requireData(supabase.from('todos').insert(row).select().single(), 'addTodo');
}

async function listTodos(userId, includeDone = false) {
  let query = supabase.from('todos').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(25);
  if (!includeDone) query = query.eq('completed', false);
  return requireData(query, 'listTodos');
}

async function completeTodo(userId, todoId) {
  return requireData(
    supabase
      .from('todos')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('id', todoId)
      .select(),
    'completeTodo'
  );
}

async function deleteTodo(userId, todoId) {
  return requireData(supabase.from('todos').delete().eq('user_id', userId).eq('id', todoId).select(), 'deleteTodo');
}

async function addBookmark(row) {
  return requireData(supabase.from('bookmarks').insert(row).select().single(), 'addBookmark');
}

async function getBookmark(userId, bookmarkId) {
  const { data } = await executeQuery(
    supabase.from('bookmarks').select('*').eq('user_id', userId).eq('id', bookmarkId).maybeSingle(),
    'getBookmark'
  );
  return data;
}

async function listBookmarks(userId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 15)));
  const offset = Math.max(0, Number(options.offset || 0));
  let query = supabase
    .from('bookmarks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (options.search) {
    const search = String(options.search).trim();
    if (search) query = query.or(`title.ilike.%${search}%,note.ilike.%${search}%,url.ilike.%${search}%`);
  }

  return requireData(query, 'listBookmarks');
}

async function updateBookmark(userId, bookmarkId, patch) {
  return requireData(
    supabase
      .from('bookmarks')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', bookmarkId)
      .select()
      .single(),
    'updateBookmark'
  );
}

async function deleteBookmark(userId, bookmarkId) {
  return requireData(supabase.from('bookmarks').delete().eq('user_id', userId).eq('id', bookmarkId).select(), 'deleteBookmark');
}

async function addCalendarEvent(row) {
  return requireData(supabase.from('calendar_events').insert(row).select().single(), 'addCalendarEvent');
}

async function getCalendarEvent(userId, eventId) {
  const { data } = await executeQuery(
    supabase.from('calendar_events').select('*').eq('user_id', userId).eq('id', eventId).maybeSingle(),
    'getCalendarEvent'
  );
  return data;
}

async function listCalendarEvents(userId, options = {}) {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 15)));
  const offset = Math.max(0, Number(options.offset || 0));
  let query = supabase
    .from('calendar_events')
    .select('*')
    .eq('user_id', userId)
    .order('starts_at', { ascending: true })
    .range(offset, offset + limit - 1);

  if (options.includePast !== true) {
    query = query.gte('starts_at', new Date().toISOString());
  }

  return requireData(query, 'listCalendarEvents');
}

async function updateCalendarEvent(userId, eventId, patch) {
  return requireData(
    supabase
      .from('calendar_events')
      .update(patch)
      .eq('user_id', userId)
      .eq('id', eventId)
      .select()
      .single(),
    'updateCalendarEvent'
  );
}

async function deleteCalendarEvent(userId, eventId) {
  return requireData(supabase.from('calendar_events').delete().eq('user_id', userId).eq('id', eventId).select(), 'deleteCalendarEvent');
}

async function saveMediaReference(row) {
  return requireData(supabase.from('media_references').insert(row).select().single(), 'saveMediaReference');
}

async function listFunPromptEntries(promptType, options = {}) {
  let query = supabase
    .from('fun_prompt_entries')
    .select('*')
    .eq('prompt_type', String(promptType || '').toLowerCase())
    .eq('enabled', true)
    .order('weight', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(250, Number(options.limit || 100))));

  if (options.nsfwOnly) {
    query = query.eq('nsfw', true);
  } else if (options.includeNsfw !== true) {
    query = query.eq('nsfw', false);
  }

  return requireData(query, 'listFunPromptEntries');
}

async function upsertPremiumPlanCatalog(rows = []) {
  if (!Array.isArray(rows) || !rows.length) return [];
  return requireData(
    supabase
      .from('premium_plan_catalog')
      .upsert(
        rows.map((row) => ({
          plan_id: row.planId,
          scope: row.scope,
          tier: row.tier,
          billing_json: row.billing || [],
          price: row.price,
          payment_methods: row.paymentMethods || [],
          perks_json: row.perks || [],
          live: row.live !== false,
          description: row.description || '',
          metadata_json: {
            name: row.name,
            recommended: Boolean(row.recommended),
            derivedFrom: row.derivedFrom || null,
            durationMonths: row.durationMonths || null
          }
        })),
        { onConflict: 'plan_id' }
      )
      .select(),
    'upsertPremiumPlanCatalog'
  );
}

async function listPremiumPlanCatalog() {
  return requireData(
    supabase
      .from('premium_plan_catalog')
      .select('*')
      .order('plan_id', { ascending: true }),
    'listPremiumPlanCatalog'
  );
}

async function createPremiumOrder(row) {
  return requireData(
    supabase
      .from('premium_orders')
      .insert(row)
      .select()
      .single(),
    'createPremiumOrder'
  );
}

async function getPremiumOrder(orderId) {
  const { data } = await executeQuery(
    supabase
      .from('premium_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle(),
    'getPremiumOrder'
  );
  return data;
}

async function getPremiumOrderByProviderRef(provider, providerRef) {
  const { data } = await executeQuery(
    supabase
      .from('premium_orders')
      .select('*')
      .eq('provider', provider)
      .eq('provider_ref', providerRef)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    'getPremiumOrderByProviderRef'
  );
  return data;
}

async function updatePremiumOrder(orderId, patch) {
  return requireData(
    supabase
      .from('premium_orders')
      .update(patch)
      .eq('id', orderId)
      .select()
      .single(),
    'updatePremiumOrder'
  );
}

async function createPremiumOrderEvent(row) {
  return requireData(
    supabase
      .from('premium_order_events')
      .insert(row)
      .select()
      .single(),
    'createPremiumOrderEvent'
  );
}

async function upsertPremiumEntitlement(row) {
  return requireData(
    supabase
      .from('premium_entitlements')
      .upsert(row, { onConflict: 'scope_type,scope_id,plan_id,tier' })
      .select()
      .single(),
    'upsertPremiumEntitlement'
  );
}

async function listPremiumEntitlements(scopeType, scopeId) {
  return requireData(
    supabase
      .from('premium_entitlements')
      .select('*')
      .eq('scope_type', scopeType)
      .eq('scope_id', scopeId)
      .order('created_at', { ascending: false }),
    'listPremiumEntitlements'
  );
}

async function createPremiumRedemptionCode(row) {
  return requireData(
    supabase
      .from('premium_redemption_codes')
      .insert(row)
      .select()
      .single(),
    'createPremiumRedemptionCode'
  );
}

async function getPremiumRedemptionCode(code) {
  const { data } = await executeQuery(
    supabase
      .from('premium_redemption_codes')
      .select('*')
      .eq('code', String(code || '').toUpperCase())
      .maybeSingle(),
    'getPremiumRedemptionCode'
  );
  return data;
}

async function redeemPremiumCode(code, patch) {
  return requireData(
    supabase
      .from('premium_redemption_codes')
      .update(patch)
      .eq('code', String(code || '').toUpperCase())
      .select()
      .single(),
    'redeemPremiumCode'
  );
}

async function setLegacyPremiumStatus(guildId, tier, expiresAt = null, metadata = {}) {
  return requireData(
    supabase
      .from('premium_status')
      .upsert(
        {
          guild_id: guildId,
          tier,
          expires_at: expiresAt,
          metadata
        },
        { onConflict: 'guild_id' }
      )
      .select()
      .single(),
    'setLegacyPremiumStatus'
  );
}

async function setLegacyRumiPlan(guildId, plan, expiresAt = null, metadata = {}) {
  return requireData(
    supabase
      .from('rumi_plans')
      .upsert(
        {
          guild_id: guildId,
          plan,
          transferable: false,
          expires_at: expiresAt,
          metadata,
          redeemed_at: new Date().toISOString()
        },
        { onConflict: 'guild_id' }
      )
      .select()
      .single(),
    'setLegacyRumiPlan'
  );
}

async function setLegacyGuildPlan(guildId, tier) {
  return requireData(
    supabase
      .from('guild_plans')
      .upsert(
        {
          guild_id: guildId,
          tier
        },
        { onConflict: 'guild_id' }
      )
      .select()
      .single(),
    'setLegacyGuildPlan'
  );
}
module.exports = {
  DatabaseUnavailableError,
  isSupabaseConfigured,
  hasDatabaseConfigured,
  isConfigured: isSupabaseConfigured,
  getSupabaseConfigIssue,
  getCircuitState: breaker.getState,
  runQuery: executeQuery,
  dbHealthCheck,
  getKv,
  setKv,
  deleteKv,
  listKv,
  upsertFakePermission,
  removeFakePermission,
  listFakePermissions,
  hasFakePermission,
  saveEmbedTemplate,
  getEmbedTemplate,
  listEmbedTemplates,
  deleteEmbedTemplate,
  saveCustomCommand,
  getCustomCommand,
  listCustomCommands,
  deleteCustomCommand,
  listDueScheduledTasks,
  createScheduledTask,
  completeScheduledTask,
  createDashboardSession,
  getDashboardSessionByTokenHash,
  touchDashboardSession,
  addTodo,
  listTodos,
  completeTodo,
  deleteTodo,
  addBookmark,
  getBookmark,
  listBookmarks,
  updateBookmark,
  deleteBookmark,
  addCalendarEvent,
  getCalendarEvent,
  listCalendarEvents,
  updateCalendarEvent,
  deleteCalendarEvent,
  saveMediaReference,
  listFunPromptEntries,
  upsertPremiumPlanCatalog,
  listPremiumPlanCatalog,
  createPremiumOrder,
  getPremiumOrder,
  getPremiumOrderByProviderRef,
  updatePremiumOrder,
  createPremiumOrderEvent,
  upsertPremiumEntitlement,
  listPremiumEntitlements,
  createPremiumRedemptionCode,
  getPremiumRedemptionCode,
  redeemPremiumCode,
  setLegacyPremiumStatus,
  setLegacyRumiPlan,
  setLegacyGuildPlan,
  supabase,
  upsertGuild,
  getGuildSettings,
  updateGuildSettings,
  upsertGuildSecurityConfig,
  getGuildSecurityConfig,
  updateGuildSecurityConfig,
  setGuildPrefix,
  resetGuildPrefix,
  getUserPrefix,
  setUserPrefix,
  resetUserPrefix,
  upsertUser,
  getUser,
  createFlag,
  getUserFlags,
  pardonUserFlags,
  deleteUserFlags,
  updateUserRisk,
  insertPunishmentLog,
  insertSecurityEvent,
  getRecentSecurityEvents,
  createJailRecord,
  getActiveJailRecord,
  releaseJailRecord,
  isWhitelisted,
  addWhitelist,
  removeWhitelist,
  listWhitelist,
  createWarning,
  getWarnings,
  deleteWarning,
  clearWarnings,
  insertSnapshot,
  getLatestSnapshot,
  markSnapshotRestored
};
