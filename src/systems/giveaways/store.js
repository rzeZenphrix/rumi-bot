const crypto = require('crypto');
const db = require('../../services/database');

function nowIso() {
  return new Date().toISOString();
}

function makePublicId() {
  return crypto.randomBytes(4).toString('hex');
}

async function single(query, context) {
  const { data } = await db.runQuery(query.maybeSingle(), context);
  return data || null;
}

async function many(query, context) {
  const { data } = await db.runQuery(query, context);
  return data || [];
}

async function getConfig(guildId) {
  const row = await single(
    db.supabase.from('giveaway_config').select('*').eq('guild_id', guildId),
    'giveaways:getConfig'
  );

  return row || {
    guild_id: guildId,
    default_entry_mode: 'BUTTON',
    default_color: '#ffb6c1',
    dm_winners: true,
    remove_entry_on_leave: true,
    settings_json: {}
  };
}

async function updateConfig(guildId, patch) {
  const payload = {
    guild_id: guildId,
    ...patch,
    updated_at: nowIso()
  };

  const { data } = await db.runQuery(
    db.supabase.from('giveaway_config').upsert(payload, { onConflict: 'guild_id' }).select().single(),
    'giveaways:updateConfig'
  );
  return data;
}

async function createGiveaway(payload) {
  let publicId = payload.public_id || makePublicId();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const insert = {
      ...payload,
      public_id: publicId
    };

    const { data, error } = await db.supabase.from('giveaways').insert(insert).select().single();
    if (!error) return data;
    if (String(error?.code) !== '23505') throw error;
    publicId = makePublicId();
  }
  throw new Error('Could not allocate a unique giveaway id.');
}

async function updateGiveaway(id, patch) {
  const { data } = await db.runQuery(
    db.supabase.from('giveaways').update({ ...patch, updated_at: nowIso() }).eq('id', id).select().single(),
    'giveaways:updateGiveaway'
  );
  return data;
}

async function getGiveaway(guildId, idOrPublicId) {
  const key = String(idOrPublicId || '').trim();
  if (!key) return null;
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key);

  let query = db.supabase.from('giveaways').select('*').eq('guild_id', guildId);
  query = isUuid ? query.eq('id', key) : query.eq('public_id', key);
  return single(query, 'giveaways:getGiveaway');
}

async function getGiveawayByMessage(guildId, messageId) {
  if (!guildId || !messageId) return null;
  return single(
    db.supabase.from('giveaways').select('*').eq('guild_id', guildId).eq('message_id', messageId),
    'giveaways:getByMessage'
  );
}

async function listGiveaways(guildId, status = null, limit = 15) {
  let query = db.supabase
    .from('giveaways')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (status) query = query.eq('status', status);
  return many(query, 'giveaways:listGiveaways');
}

async function listDueActiveGiveaways() {
  return many(
    db.supabase
      .from('giveaways')
      .select('*')
      .eq('status', 'ACTIVE')
      .lte('ends_at', nowIso())
      .order('ends_at', { ascending: true })
      .limit(50),
    'giveaways:listDueActive'
  );
}

async function listDueScheduledGiveaways() {
  return many(
    db.supabase
      .from('giveaways')
      .select('*')
      .eq('status', 'SCHEDULED')
      .lte('starts_at', nowIso())
      .order('starts_at', { ascending: true })
      .limit(50),
    'giveaways:listDueScheduled'
  );
}

async function addEntry(giveaway, userId, patch = {}) {
  const payload = {
    giveaway_id: giveaway.id,
    guild_id: giveaway.guild_id,
    user_id: userId,
    entries: Math.max(1, Number(patch.entries || 1)),
    bonus_entries: Math.max(0, Number(patch.bonus_entries || 0)),
    valid: patch.valid !== false,
    invalid_reason: patch.invalid_reason || null,
    metadata: patch.metadata || {}
  };

  const { data } = await db.runQuery(
    db.supabase
      .from('giveaway_entries')
      .upsert(payload, { onConflict: 'giveaway_id,user_id' })
      .select()
      .single(),
    'giveaways:addEntry'
  );
  return data;
}

async function removeEntry(giveawayId, userId) {
  await db.runQuery(
    db.supabase.from('giveaway_entries').delete().eq('giveaway_id', giveawayId).eq('user_id', userId),
    'giveaways:removeEntry'
  );
}

async function listEntries(giveawayId, { validOnly = false } = {}) {
  let query = db.supabase
    .from('giveaway_entries')
    .select('*')
    .eq('giveaway_id', giveawayId)
    .order('created_at', { ascending: true });
  if (validOnly) query = query.eq('valid', true);
  return many(query, 'giveaways:listEntries');
}

async function countEntries(giveawayId) {
  const { count } = await db.runQuery(
    db.supabase
      .from('giveaway_entries')
      .select('id', { count: 'exact', head: true })
      .eq('giveaway_id', giveawayId)
      .eq('valid', true),
    'giveaways:countEntries'
  );
  return Number(count || 0);
}

async function addWinner(giveaway, winner, selectionType = 'end', actorId = null, selection = {}) {
  const { data } = await db.runQuery(
    db.supabase
      .from('giveaway_winners')
      .insert({
        giveaway_id: giveaway.id,
        guild_id: giveaway.guild_id,
        user_id: winner.user_id || winner.userId,
        entries: Number(winner.entries || 1),
        bonus_entries: Number(winner.bonus_entries || winner.bonusEntries || 0),
        selected_by: actorId,
        selection_type: selectionType,
        selection_json: selection
      })
      .select()
      .single(),
    'giveaways:addWinner'
  );
  return data;
}

async function listWinners(giveawayId) {
  return many(
    db.supabase.from('giveaway_winners').select('*').eq('giveaway_id', giveawayId).order('created_at', { ascending: false }),
    'giveaways:listWinners'
  );
}

async function createPreset(guildId, name, config, createdBy) {
  const { data } = await db.runQuery(
    db.supabase
      .from('giveaway_presets')
      .upsert({
        guild_id: guildId,
        name: String(name).toLowerCase(),
        config_json: config,
        created_by: createdBy,
        updated_at: nowIso()
      }, { onConflict: 'guild_id,name' })
      .select()
      .single(),
    'giveaways:createPreset'
  );
  return data;
}

async function getPreset(guildId, name) {
  return single(
    db.supabase.from('giveaway_presets').select('*').eq('guild_id', guildId).eq('name', String(name).toLowerCase()),
    'giveaways:getPreset'
  );
}

async function listPresets(guildId) {
  return many(
    db.supabase.from('giveaway_presets').select('*').eq('guild_id', guildId).order('name', { ascending: true }),
    'giveaways:listPresets'
  );
}

async function deletePreset(guildId, name) {
  await db.runQuery(
    db.supabase.from('giveaway_presets').delete().eq('guild_id', guildId).eq('name', String(name).toLowerCase()),
    'giveaways:deletePreset'
  );
}

async function addCondition(giveaway, condition, createdBy) {
  const { data } = await db.runQuery(
    db.supabase
      .from('giveaway_conditions')
      .insert({
        giveaway_id: giveaway.id,
        guild_id: giveaway.guild_id,
        type: condition.type,
        scope: condition.scope || 'entry',
        config_json: condition,
        created_by: createdBy
      })
      .select()
      .single(),
    'giveaways:addCondition'
  );
  return data;
}

async function listConditions(giveawayId, scope = null) {
  let query = db.supabase.from('giveaway_conditions').select('*').eq('giveaway_id', giveawayId);
  if (scope) query = query.in('scope', [scope, 'both']);
  return many(query.order('created_at', { ascending: true }), 'giveaways:listConditions');
}

async function removeCondition(giveawayId, conditionId) {
  await db.runQuery(
    db.supabase.from('giveaway_conditions').delete().eq('giveaway_id', giveawayId).eq('id', conditionId),
    'giveaways:removeCondition'
  );
}

async function clearConditions(giveawayId) {
  await db.runQuery(db.supabase.from('giveaway_conditions').delete().eq('giveaway_id', giveawayId), 'giveaways:clearConditions');
}

async function addBonusRule(giveaway, rule, createdBy) {
  const { data } = await db.runQuery(
    db.supabase
      .from('giveaway_bonus_rules')
      .insert({
        giveaway_id: giveaway.id,
        guild_id: giveaway.guild_id,
        type: rule.type,
        entries: Number(rule.entries || 1),
        config_json: rule,
        created_by: createdBy
      })
      .select()
      .single(),
    'giveaways:addBonusRule'
  );
  return data;
}

async function listBonusRules(giveawayId) {
  return many(
    db.supabase.from('giveaway_bonus_rules').select('*').eq('giveaway_id', giveawayId).order('created_at', { ascending: true }),
    'giveaways:listBonusRules'
  );
}

async function removeBonusRule(giveawayId, ruleId) {
  await db.runQuery(
    db.supabase.from('giveaway_bonus_rules').delete().eq('giveaway_id', giveawayId).eq('id', ruleId),
    'giveaways:removeBonusRule'
  );
}

async function logEvent(guildId, giveawayId, eventType, actorId = null, details = {}) {
  await db.runQuery(
    db.supabase.from('giveaway_logs').insert({
      guild_id: guildId,
      giveaway_id: giveawayId,
      actor_id: actorId,
      event_type: eventType,
      details_json: details
    }),
    'giveaways:logEvent'
  ).catch(() => null);
}

async function recordInviteSnapshot(invite) {
  if (!invite?.guild_id || !invite?.code) return null;
  const { data } = await db.runQuery(
    db.supabase
      .from('invite_tracking')
      .upsert(invite, { onConflict: 'guild_id,code' })
      .select()
      .single(),
    'giveaways:recordInviteSnapshot'
  );
  return data;
}

async function recordInviteJoin(row) {
  if (!row?.guild_id || !row?.joined_member_id) return null;
  const { data } = await db.runQuery(
    db.supabase
      .from('invite_joins')
      .upsert(row, { onConflict: 'guild_id,joined_member_id' })
      .select()
      .single(),
    'giveaways:recordInviteJoin'
  );
  return data;
}

async function createRecurringRule(guildId, name, everySeconds, payload, createdBy) {
  const nextRunAt = new Date(Date.now() + everySeconds * 1000).toISOString();
  const { data } = await db.runQuery(
    db.supabase
      .from('giveaway_recurring_rules')
      .upsert({
        guild_id: guildId,
        name: String(name).toLowerCase(),
        every_seconds: everySeconds,
        preset_name: payload.presetName || null,
        payload_json: payload,
        next_run_at: nextRunAt,
        enabled: true,
        created_by: createdBy,
        updated_at: nowIso()
      }, { onConflict: 'guild_id,name' })
      .select()
      .single(),
    'giveaways:createRecurringRule'
  );
  return data;
}

async function listRecurringRules(guildId) {
  return many(
    db.supabase.from('giveaway_recurring_rules').select('*').eq('guild_id', guildId).order('name', { ascending: true }),
    'giveaways:listRecurringRules'
  );
}

async function deleteRecurringRule(guildId, name) {
  await db.runQuery(
    db.supabase.from('giveaway_recurring_rules').delete().eq('guild_id', guildId).eq('name', String(name).toLowerCase()),
    'giveaways:deleteRecurringRule'
  );
}

async function listDueRecurringRules() {
  return many(
    db.supabase
      .from('giveaway_recurring_rules')
      .select('*')
      .eq('enabled', true)
      .lte('next_run_at', nowIso())
      .order('next_run_at', { ascending: true })
      .limit(25),
    'giveaways:listDueRecurringRules'
  );
}

async function bumpRecurringRule(rule) {
  const nextRunAt = new Date(Date.now() + Number(rule.every_seconds || 86400) * 1000).toISOString();
  const { data } = await db.runQuery(
    db.supabase
      .from('giveaway_recurring_rules')
      .update({ next_run_at: nextRunAt, updated_at: nowIso() })
      .eq('id', rule.id)
      .select()
      .single(),
    'giveaways:bumpRecurringRule'
  );
  return data;
}

async function getInviteJoin(guildId, memberId) {
  return single(
    db.supabase.from('invite_joins').select('*').eq('guild_id', guildId).eq('joined_member_id', memberId),
    'giveaways:getInviteJoin'
  );
}

module.exports = {
  getConfig,
  updateConfig,
  createGiveaway,
  updateGiveaway,
  getGiveaway,
  getGiveawayByMessage,
  listGiveaways,
  listDueActiveGiveaways,
  listDueScheduledGiveaways,
  addEntry,
  removeEntry,
  listEntries,
  countEntries,
  addWinner,
  listWinners,
  createPreset,
  getPreset,
  listPresets,
  deletePreset,
  addCondition,
  listConditions,
  removeCondition,
  clearConditions,
  addBonusRule,
  listBonusRules,
  removeBonusRule,
  logEvent,
  recordInviteSnapshot,
  recordInviteJoin,
  createRecurringRule,
  listRecurringRules,
  deleteRecurringRule,
  listDueRecurringRules,
  bumpRecurringRule,
  getInviteJoin
};
