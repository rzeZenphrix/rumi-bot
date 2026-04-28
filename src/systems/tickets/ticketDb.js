const db = require('../../services/database');
const { getPremiumStatus } = require('../monetization/service');

const OPEN_STATUSES = ['pending', 'open', 'claimed'];
const SERVER_TIER_ORDER = ['free', 'base', 'tier1', 'tier2', 'tier3'];
const TICKET_TYPE_UPDATE_FIELDS = new Set([
  'name',
  'description',
  'emoji',
  'enabled',
  'category_id',
  'parent_channel_id',
  'channel_name_format',
  'creation_mode',
  'welcome_message',
  'max_open_per_user',
  'cooldown_seconds',
  'allow_reopen',
  'require_staff_approval',
  'prevent_duplicate_type',
  'ping_staff_on_open',
  'opener_can_close',
  'claimed_invisible_to_other_staff',
  'staff_role_ids',
  'view_role_ids',
  'claim_role_ids',
  'close_role_ids',
  'delete_role_ids',
  'reopen_role_ids',
  'participant_manage_role_ids',
  'transcript_role_ids',
  'additional_user_ids',
  'blocked_user_ids',
  'blocked_role_ids',
  'required_role_ids',
  'log_channel_id',
  'transcript_channel_id',
  'save_transcript_on_close',
  'dm_transcript_to_opener',
  'dm_transcript_to_closer',
  'transcript_include_attachments',
  'transcript_include_embeds',
  'auto_close_after_seconds',
  'auto_delete_after_seconds',
  'settings'
]);
const TICKET_UPDATE_FIELDS = new Set([
  'status',
  'channel_id',
  'thread_id',
  'claimed_by',
  'claimed_at',
  'closed_by',
  'closed_at',
  'close_reason',
  'reopened_by',
  'reopened_at',
  'last_activity_at',
  'form_summary',
  'metadata'
]);

function arrayValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [String(value)].filter(Boolean);
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function bestServerTier(activePlans = []) {
  let best = 'free';

  for (const plan of activePlans) {
    if (plan.scope !== 'server') continue;
    if (SERVER_TIER_ORDER.indexOf(plan.tier) > SERVER_TIER_ORDER.indexOf(best)) {
      best = plan.tier;
    }
  }

  return best;
}

async function maybeSingle(builder, context) {
  const { data } = await db.runQuery(builder.maybeSingle(), context);
  return data || null;
}

async function single(builder, context) {
  const { data } = await db.runQuery(builder.single(), context);
  return data;
}

async function many(builder, context) {
  const { data } = await db.runQuery(builder, context);
  return data || [];
}

async function mutate(builder, context) {
  const { data } = await db.runQuery(builder, context);
  return data ?? null;
}

async function getPlan(guildId) {
  const status = await getPremiumStatus({ guildId }).catch(() => null);
  if (!status) {
    return { guild_id: guildId, tier: 'free' };
  }

  return {
    guild_id: guildId,
    tier: bestServerTier(status.activePlans || [])
  };
}

async function createPanel({ guildId, userId, name = 'Main Ticket Panel' }) {
  const plan = await getPlan(guildId);

  if (plan.tier === 'free') {
    const existing = await getPanel(guildId);
    if (existing) {
      const error = new Error('FREE_PANEL_LIMIT');
      error.code = 'FREE_PANEL_LIMIT';
      throw error;
    }
  }

  return single(
    db.supabase
      .from('ticket_panels')
      .insert({
        guild_id: guildId,
        name,
        created_by: userId,
        updated_by: userId
      })
      .select(),
    'ticket:createPanel'
  );
}

async function listPanels(guildId) {
  return many(
    db.supabase
      .from('ticket_panels')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: true }),
    'ticket:listPanels'
  );
}

async function getPanel(guildId, panelId = null) {
  let query = db.supabase
    .from('ticket_panels')
    .select('*')
    .eq('guild_id', guildId);

  if (panelId) {
    query = query.eq('id', panelId);
  } else {
    query = query.order('created_at', { ascending: true }).limit(1);
  }

  return maybeSingle(query, 'ticket:getPanel');
}

async function updatePanel(guildId, updates = {}, panelId = null) {
  const panel = await getPanel(guildId, panelId);
  if (!panel) return null;

  const patch = { ...updates };
  if (!Object.keys(patch).length) return panel;

  return single(
    db.supabase
      .from('ticket_panels')
      .update(patch)
      .eq('id', panel.id)
      .select(),
    'ticket:updatePanel'
  );
}

async function deletePanel(guildId, panelId = null) {
  const panel = await getPanel(guildId, panelId);
  if (!panel) return null;

  await mutate(
    db.supabase
      .from('ticket_panels')
      .delete()
      .eq('id', panel.id),
    'ticket:deletePanel'
  );
  return panel;
}

async function countTypes(guildId) {
  const { count } = await db.runQuery(
    db.supabase
      .from('ticket_types')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId),
    'ticket:countTypes'
  );

  return Number(count || 0);
}

async function addTicketType({ guildId, panelId, key, name, description = null, emoji = null, userId }) {
  const plan = await getPlan(guildId);
  const total = await countTypes(guildId);

  if (plan.tier === 'free' && total >= 7) {
    const error = new Error('FREE_TYPE_LIMIT');
    error.code = 'FREE_TYPE_LIMIT';
    throw error;
  }

  return single(
    db.supabase
      .from('ticket_types')
      .insert({
        guild_id: guildId,
        panel_id: panelId,
        key: normalizeKey(key),
        name,
        description,
        emoji,
        created_by: userId,
        updated_by: userId
      })
      .select(),
    'ticket:addTicketType'
  );
}

async function upsertTicketType({ guildId, panelId, key, name, description = null, emoji = null, userId }) {
  return single(
    db.supabase
      .from('ticket_types')
      .upsert({
        guild_id: guildId,
        panel_id: panelId,
        key: normalizeKey(key),
        name,
        description,
        emoji,
        created_by: userId,
        updated_by: userId
      }, { onConflict: 'guild_id,key' })
      .select(),
    'ticket:upsertTicketType'
  );
}

async function getTicketType(guildId, key) {
  return maybeSingle(
    db.supabase
      .from('ticket_types')
      .select('*')
      .eq('guild_id', guildId)
      .eq('key', normalizeKey(key)),
    'ticket:getTicketType'
  );
}

async function listTicketTypes(guildId, panelId = null) {
  let query = db.supabase
    .from('ticket_types')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: true });

  if (panelId) query = query.eq('panel_id', panelId);

  return many(query, 'ticket:listTicketTypes');
}

async function removeTicketType(guildId, key) {
  const row = await getTicketType(guildId, key);
  if (!row) return null;

  await mutate(
    db.supabase
      .from('ticket_types')
      .delete()
      .eq('guild_id', guildId)
      .eq('key', normalizeKey(key)),
    'ticket:removeTicketType'
  );

  return row;
}

async function setTypeEnabled(guildId, key, enabled, userId) {
  return single(
    db.supabase
      .from('ticket_types')
      .update({
        enabled,
        updated_by: userId
      })
      .eq('guild_id', guildId)
      .eq('key', normalizeKey(key))
      .select(),
    'ticket:setTypeEnabled'
  );
}

async function updateTicketType(guildId, key, updates, userId) {
  const patch = {};

  for (const [field, value] of Object.entries(updates || {})) {
    if (TICKET_TYPE_UPDATE_FIELDS.has(field)) {
      patch[field] = value;
    }
  }

  if (!Object.keys(patch).length) {
    return getTicketType(guildId, key);
  }

  patch.updated_by = userId;

  return single(
    db.supabase
      .from('ticket_types')
      .update(patch)
      .eq('guild_id', guildId)
      .eq('key', normalizeKey(key))
      .select(),
    'ticket:updateTicketType'
  );
}

async function listQuestions(guildId, typeId) {
  return many(
    db.supabase
      .from('ticket_form_questions')
      .select('*')
      .eq('guild_id', guildId)
      .eq('ticket_type_id', typeId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    'ticket:listQuestions'
  );
}

async function addQuestion({ guildId, typeId, label, placeholder = null, style = 'paragraph', required = true }) {
  const existing = await listQuestions(guildId, typeId);
  if (existing.length >= 5) {
    const error = new Error('MODAL_QUESTION_LIMIT');
    error.code = 'MODAL_QUESTION_LIMIT';
    throw error;
  }

  return single(
    db.supabase
      .from('ticket_form_questions')
      .insert({
        guild_id: guildId,
        ticket_type_id: typeId,
        label,
        placeholder,
        style,
        required,
        sort_order: existing.length
      })
      .select(),
    'ticket:addQuestion'
  );
}

async function removeQuestion(guildId, questionId) {
  return maybeSingle(
    db.supabase
      .from('ticket_form_questions')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', questionId)
      .select(),
    'ticket:removeQuestion'
  );
}

async function countOpenTicketsForUser(guildId, userId, typeKey = null) {
  let query = db.supabase
    .from('tickets')
    .select('*', { count: 'exact', head: true })
    .eq('guild_id', guildId)
    .eq('opener_id', userId)
    .in('status', OPEN_STATUSES);

  if (typeKey) {
    query = query.eq('ticket_type_key', normalizeKey(typeKey));
  }

  const { count } = await db.runQuery(query, 'ticket:countOpenTicketsForUser');
  return Number(count || 0);
}

async function getCooldown(guildId, userId, typeKey) {
  return maybeSingle(
    db.supabase
      .from('ticket_cooldowns')
      .select('*')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .eq('ticket_type_key', normalizeKey(typeKey))
      .gt('expires_at', new Date().toISOString()),
    'ticket:getCooldown'
  );
}

async function setCooldown(guildId, userId, typeKey, seconds) {
  if (!seconds || seconds <= 0) return null;

  const expiresAt = new Date(Date.now() + Number(seconds) * 1000).toISOString();

  return single(
    db.supabase
      .from('ticket_cooldowns')
      .upsert({
        guild_id: guildId,
        user_id: userId,
        ticket_type_key: normalizeKey(typeKey),
        expires_at: expiresAt
      }, { onConflict: 'guild_id,user_id,ticket_type_key' })
      .select(),
    'ticket:setCooldown'
  );
}

async function createTicketRecord({ guildId, panelId, type, openerId, channelId = null, threadId = null, formSummary = null }) {
  return single(
    db.supabase
      .from('tickets')
      .insert({
        guild_id: guildId,
        panel_id: panelId,
        ticket_type_id: type.id,
        ticket_type_key: type.key,
        ticket_type_name: type.name,
        opener_id: openerId,
        channel_id: channelId,
        thread_id: threadId,
        form_summary: formSummary
      })
      .select(),
    'ticket:createTicketRecord'
  );
}

async function updateTicket(ticketId, updates = {}) {
  const patch = {};

  for (const [field, value] of Object.entries(updates || {})) {
    if (TICKET_UPDATE_FIELDS.has(field)) {
      patch[field] = value;
    }
  }

  if (!Object.keys(patch).length) return getTicket(ticketId);

  return single(
    db.supabase
      .from('tickets')
      .update(patch)
      .eq('id', ticketId)
      .select(),
    'ticket:updateTicket'
  );
}

async function getTicket(ticketId) {
  return maybeSingle(
    db.supabase
      .from('tickets')
      .select('*')
      .eq('id', ticketId),
    'ticket:getTicket'
  );
}

async function getTicketByChannel(guildId, channelId) {
  return maybeSingle(
    db.supabase
      .from('tickets')
      .select('*')
      .eq('guild_id', guildId)
      .or(`channel_id.eq.${channelId},thread_id.eq.${channelId}`)
      .order('created_at', { ascending: false })
      .limit(1),
    'ticket:getTicketByChannel'
  );
}

async function addParticipant(ticketId, guildId, userId, addedBy) {
  return single(
    db.supabase
      .from('ticket_participants')
      .upsert({
        ticket_id: ticketId,
        guild_id: guildId,
        user_id: userId,
        added_by: addedBy,
        removed_at: null,
        removed_by: null
      }, { onConflict: 'ticket_id,user_id' })
      .select(),
    'ticket:addParticipant'
  );
}

async function removeParticipant(ticketId, guildId, userId, removedBy) {
  return maybeSingle(
    db.supabase
      .from('ticket_participants')
      .update({
        removed_at: new Date().toISOString(),
        removed_by: removedBy
      })
      .eq('ticket_id', ticketId)
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .select(),
    'ticket:removeParticipant'
  );
}

async function logTicket({ ticketId = null, guildId, eventType, actorId = null, targetId = null, channelId = null, details = null, metadata = {} }) {
  return single(
    db.supabase
      .from('ticket_logs')
      .insert({
        ticket_id: ticketId,
        guild_id: guildId,
        event_type: eventType,
        actor_id: actorId,
        target_id: targetId,
        channel_id: channelId,
        details,
        metadata
      })
      .select(),
    'ticket:logTicket'
  );
}

async function saveTranscript({ ticketId, guildId, format = 'txt', content, fileUrl = null, generatedBy, messageCount = 0, attachmentCount = 0 }) {
  return single(
    db.supabase
      .from('ticket_transcripts')
      .insert({
        ticket_id: ticketId,
        guild_id: guildId,
        format,
        content,
        file_url: fileUrl,
        generated_by: generatedBy,
        message_count: messageCount,
        attachment_count: attachmentCount
      })
      .select(),
    'ticket:saveTranscript'
  );
}

async function saveFormAnswers({ ticketId, guildId, answers }) {
  const rows = (answers || []).map((item) => ({
    ticket_id: ticketId,
    question_id: item.questionId || null,
    guild_id: guildId,
    question_label: item.label,
    answer: item.answer
  }));

  if (!rows.length) return [];

  return many(
    db.supabase
      .from('ticket_form_answers')
      .insert(rows)
      .select(),
    'ticket:saveFormAnswers'
  );
}

module.exports = {
  arrayValue,
  getPlan,
  createPanel,
  listPanels,
  getPanel,
  updatePanel,
  deletePanel,
  countTypes,
  addTicketType,
  upsertTicketType,
  getTicketType,
  listTicketTypes,
  removeTicketType,
  setTypeEnabled,
  updateTicketType,
  listQuestions,
  addQuestion,
  removeQuestion,
  countOpenTicketsForUser,
  getCooldown,
  setCooldown,
  createTicketRecord,
  updateTicket,
  getTicket,
  getTicketByChannel,
  addParticipant,
  removeParticipant,
  logTicket,
  saveTranscript,
  saveFormAnswers
};
