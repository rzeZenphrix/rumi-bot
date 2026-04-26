const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_THRESHOLDS } = require('../../utils/constants');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
}

const supabase = createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false
  }
});

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
  const { data, error } = await query;

  if (error) {
    error.context = context;
    throw error;
  }

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
  const { data, error } = await supabase
    .from('guilds')
    .select('*')
    .eq('guild_id', guildId)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    return upsertGuild(guildId);
  }

  return {
    ...data,
    prefix: data.prefix || process.env.DEFAULT_PREFIX || '!',
    thresholds_json: mergeThresholds(data.thresholds_json || {})
  };
}

async function updateGuildSettings(guildId, patch) {
  return requireData(
    supabase
      .from('guilds')
      .update(patch)
      .eq('guild_id', guildId)
      .select()
      .single(),
    'updateGuildSettings'
  );
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
  const { data, error } = await supabase
    .from('user_prefixes')
    .select('prefix')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

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
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

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
  const { data, error } = await supabase
    .from('jail_records')
    .select('*')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;

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
  const { data, error } = await supabase
    .from('security_whitelist')
    .select('user_id')
    .eq('guild_id', guildId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;

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

  const { data, error } = await query.maybeSingle();

  if (error) throw error;

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
  const { error } = await supabase.from('guilds').select('guild_id').limit(1);

  return {
    ok: !error,
    latencyMs: Date.now() - started,
    error: error ? error.message : null
  };
}

async function getKv(namespace, key, fallback = null) {
  const { data, error } = await supabase
    .from('bot_kv')
    .select('value')
    .eq('namespace', namespace)
    .eq('key', key)
    .maybeSingle();

  if (error) throw error;
  return data ? data.value : fallback;
}

async function setKv(namespace, key, value) {
  return requireData(
    supabase
      .from('bot_kv')
      .upsert({ namespace, key, value }, { onConflict: 'namespace,key' })
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

  const { data, error } = await query.or(orParts.join(','));
  if (error) throw error;
  return Boolean(data?.length);
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
  const { data, error } = await supabase
    .from('embed_templates')
    .select('*')
    .eq('guild_id', guildId)
    .eq('name', name.toLowerCase())
    .maybeSingle();

  if (error) throw error;
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
  const { data, error } = await supabase
    .from('custom_commands')
    .select('*')
    .eq('guild_id', guildId)
    .eq('name', name.toLowerCase())
    .eq('enabled', true)
    .maybeSingle();

  if (error) throw error;
  return data;
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

async function listBookmarks(userId) {
  return requireData(supabase.from('bookmarks').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(15), 'listBookmarks');
}

async function deleteBookmark(userId, bookmarkId) {
  return requireData(supabase.from('bookmarks').delete().eq('user_id', userId).eq('id', bookmarkId).select(), 'deleteBookmark');
}

async function addCalendarEvent(row) {
  return requireData(supabase.from('calendar_events').insert(row).select().single(), 'addCalendarEvent');
}

async function listCalendarEvents(userId) {
  return requireData(supabase.from('calendar_events').select('*').eq('user_id', userId).gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(15), 'listCalendarEvents');
}

async function deleteCalendarEvent(userId, eventId) {
  return requireData(supabase.from('calendar_events').delete().eq('user_id', userId).eq('id', eventId).select(), 'deleteCalendarEvent');
}

async function saveMediaReference(row) {
  return requireData(supabase.from('media_references').insert(row).select().single(), 'saveMediaReference');
}
module.exports = {
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
  createDashboardSession,
  addTodo,
  listTodos,
  completeTodo,
  deleteTodo,
  addBookmark,
  listBookmarks,
  deleteBookmark,
  addCalendarEvent,
  listCalendarEvents,
  deleteCalendarEvent,
  saveMediaReference,
  supabase,
  upsertGuild,
  getGuildSettings,
  updateGuildSettings,
  setGuildPrefix,
  resetGuildPrefix,
  getUserPrefix,
  setUserPrefix,
  resetUserPrefix,
  upsertUser,
  getUser,
  createFlag,
  getUserFlags,
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
