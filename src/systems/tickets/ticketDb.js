const db = require('../database/db');

const OPEN_STATUSES = ['pending', 'open', 'claimed'];

function arrayValue(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [String(value)].filter(Boolean);
}

async function getPlan(guildId) {
  const row = await db.one(
    `select * from guild_plans where guild_id = $1`,
    [guildId]
  );

  return row || { guild_id: guildId, tier: 'free' };
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

  return db.one(
    `insert into ticket_panels (guild_id, name, created_by, updated_by)
     values ($1, $2, $3, $3)
     returning *`,
    [guildId, name, userId]
  );
}

async function listPanels(guildId) {
  return db.many(
    `select * from ticket_panels where guild_id = $1 order by created_at asc`,
    [guildId]
  );
}

async function getPanel(guildId, panelId = null) {
  if (panelId) {
    return db.one(
      `select * from ticket_panels where guild_id = $1 and id = $2`,
      [guildId, panelId]
    );
  }

  return db.one(
    `select * from ticket_panels where guild_id = $1 order by created_at asc limit 1`,
    [guildId]
  );
}

async function updatePanel(guildId, updates = {}, panelId = null) {
  const panel = await getPanel(guildId, panelId);
  if (!panel) return null;

  const fields = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(updates)) {
    fields.push(`${key} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (!fields.length) return panel;

  values.push(panel.id);

  return db.one(
    `update ticket_panels set ${fields.join(', ')}
     where id = $${i}
     returning *`,
    values
  );
}

async function deletePanel(guildId, panelId = null) {
  const panel = await getPanel(guildId, panelId);
  if (!panel) return null;

  await db.query(`delete from ticket_panels where id = $1`, [panel.id]);
  return panel;
}

async function countTypes(guildId) {
  const row = await db.one(
    `select count(*)::int as count from ticket_types where guild_id = $1`,
    [guildId]
  );

  return row?.count || 0;
}

async function addTicketType({ guildId, panelId, key, name, description = null, emoji = null, userId }) {
  const plan = await getPlan(guildId);
  const total = await countTypes(guildId);

  if (plan.tier === 'free' && total >= 7) {
    const error = new Error('FREE_TYPE_LIMIT');
    error.code = 'FREE_TYPE_LIMIT';
    throw error;
  }

  return db.one(
    `insert into ticket_types
      (guild_id, panel_id, key, name, description, emoji, created_by, updated_by)
     values ($1, $2, lower($3), $4, $5, $6, $7, $7)
     returning *`,
    [guildId, panelId, key, name, description, emoji, userId]
  );
}

async function upsertTicketType({ guildId, panelId, key, name, description = null, emoji = null, userId }) {
  return db.one(
    `insert into ticket_types
      (guild_id, panel_id, key, name, description, emoji, created_by, updated_by)
     values ($1, $2, lower($3), $4, $5, $6, $7, $7)
     on conflict (guild_id, key) do update
       set name = excluded.name,
           description = coalesce(excluded.description, ticket_types.description),
           emoji = coalesce(excluded.emoji, ticket_types.emoji),
           updated_by = excluded.updated_by
     returning *`,
    [guildId, panelId, key, name, description, emoji, userId]
  );
}

async function getTicketType(guildId, key) {
  return db.one(
    `select * from ticket_types where guild_id = $1 and key = lower($2)`,
    [guildId, key]
  );
}

async function listTicketTypes(guildId, panelId = null) {
  if (panelId) {
    return db.many(
      `select * from ticket_types where guild_id = $1 and panel_id = $2 order by created_at asc`,
      [guildId, panelId]
    );
  }

  return db.many(
    `select * from ticket_types where guild_id = $1 order by created_at asc`,
    [guildId]
  );
}

async function removeTicketType(guildId, key) {
  const row = await getTicketType(guildId, key);
  if (!row) return null;

  await db.query(
    `delete from ticket_types where guild_id = $1 and key = lower($2)`,
    [guildId, key]
  );

  return row;
}

async function setTypeEnabled(guildId, key, enabled, userId) {
  return db.one(
    `update ticket_types
     set enabled = $3, updated_by = $4
     where guild_id = $1 and key = lower($2)
     returning *`,
    [guildId, key, enabled, userId]
  );
}

async function updateTicketType(guildId, key, updates, userId) {
  const allowed = new Set([
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

  const fields = [];
  const values = [guildId, key];
  let i = 3;

  for (const [field, value] of Object.entries(updates)) {
    if (!allowed.has(field)) continue;
    fields.push(`${field} = $${i}`);
    values.push(value);
    i += 1;
  }

  fields.push(`updated_by = $${i}`);
  values.push(userId);
  i += 1;

  if (!fields.length) return getTicketType(guildId, key);

  return db.one(
    `update ticket_types
     set ${fields.join(', ')}
     where guild_id = $1 and key = lower($2)
     returning *`,
    values
  );
}

async function listQuestions(guildId, typeId) {
  return db.many(
    `select * from ticket_form_questions
     where guild_id = $1 and ticket_type_id = $2
     order by sort_order asc, created_at asc`,
    [guildId, typeId]
  );
}

async function addQuestion({ guildId, typeId, label, placeholder = null, style = 'paragraph', required = true }) {
  const existing = await listQuestions(guildId, typeId);
  if (existing.length >= 5) {
    const error = new Error('MODAL_QUESTION_LIMIT');
    error.code = 'MODAL_QUESTION_LIMIT';
    throw error;
  }

  return db.one(
    `insert into ticket_form_questions
      (guild_id, ticket_type_id, label, placeholder, style, required, sort_order)
     values ($1, $2, $3, $4, $5, $6, $7)
     returning *`,
    [guildId, typeId, label, placeholder, style, required, existing.length]
  );
}

async function removeQuestion(guildId, questionId) {
  const row = await db.one(
    `delete from ticket_form_questions
     where guild_id = $1 and id = $2
     returning *`,
    [guildId, questionId]
  );

  return row;
}

async function countOpenTicketsForUser(guildId, userId, typeKey = null) {
  const statuses = OPEN_STATUSES;

  if (typeKey) {
    const row = await db.one(
      `select count(*)::int as count
       from tickets
       where guild_id = $1
         and opener_id = $2
         and ticket_type_key = lower($3)
         and status = any($4::text[])`,
      [guildId, userId, typeKey, statuses]
    );

    return row?.count || 0;
  }

  const row = await db.one(
    `select count(*)::int as count
     from tickets
     where guild_id = $1
       and opener_id = $2
       and status = any($3::text[])`,
    [guildId, userId, statuses]
  );

  return row?.count || 0;
}

async function getCooldown(guildId, userId, typeKey) {
  return db.one(
    `select * from ticket_cooldowns
     where guild_id = $1 and user_id = $2 and ticket_type_key = lower($3) and expires_at > now()`,
    [guildId, userId, typeKey]
  );
}

async function setCooldown(guildId, userId, typeKey, seconds) {
  if (!seconds || seconds <= 0) return null;

  return db.one(
    `insert into ticket_cooldowns (guild_id, user_id, ticket_type_key, expires_at)
     values ($1, $2, lower($3), now() + ($4 || ' seconds')::interval)
     on conflict (guild_id, user_id, ticket_type_key)
     do update set expires_at = excluded.expires_at
     returning *`,
    [guildId, userId, typeKey, seconds]
  );
}

async function createTicketRecord({ guildId, panelId, type, openerId, channelId = null, threadId = null, formSummary = null }) {
  return db.one(
    `insert into tickets
      (guild_id, panel_id, ticket_type_id, ticket_type_key, ticket_type_name, opener_id, channel_id, thread_id, form_summary)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     returning *`,
    [guildId, panelId, type.id, type.key, type.name, openerId, channelId, threadId, formSummary]
  );
}

async function updateTicket(ticketId, updates = {}) {
  const allowed = new Set([
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

  const fields = [];
  const values = [];
  let i = 1;

  for (const [field, value] of Object.entries(updates)) {
    if (!allowed.has(field)) continue;
    fields.push(`${field} = $${i}`);
    values.push(value);
    i += 1;
  }

  if (!fields.length) return getTicket(ticketId);

  values.push(ticketId);

  return db.one(
    `update tickets set ${fields.join(', ')}
     where id = $${i}
     returning *`,
    values
  );
}

async function getTicket(ticketId) {
  return db.one(
    `select * from tickets where id = $1`,
    [ticketId]
  );
}

async function getTicketByChannel(guildId, channelId) {
  return db.one(
    `select * from tickets
     where guild_id = $1 and (channel_id = $2 or thread_id = $2)
     order by created_at desc
     limit 1`,
    [guildId, channelId]
  );
}

async function addParticipant(ticketId, guildId, userId, addedBy) {
  return db.one(
    `insert into ticket_participants (ticket_id, guild_id, user_id, added_by)
     values ($1, $2, $3, $4)
     on conflict (ticket_id, user_id)
     do update set removed_at = null, removed_by = null, added_by = excluded.added_by
     returning *`,
    [ticketId, guildId, userId, addedBy]
  );
}

async function removeParticipant(ticketId, guildId, userId, removedBy) {
  return db.one(
    `update ticket_participants
     set removed_at = now(), removed_by = $4
     where ticket_id = $1 and guild_id = $2 and user_id = $3
     returning *`,
    [ticketId, guildId, userId, removedBy]
  );
}

async function logTicket({ ticketId = null, guildId, eventType, actorId = null, targetId = null, channelId = null, details = null, metadata = {} }) {
  return db.one(
    `insert into ticket_logs
      (ticket_id, guild_id, event_type, actor_id, target_id, channel_id, details, metadata)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [ticketId, guildId, eventType, actorId, targetId, channelId, details, metadata]
  );
}

async function saveTranscript({ ticketId, guildId, format = 'txt', content, fileUrl = null, generatedBy, messageCount = 0, attachmentCount = 0 }) {
  return db.one(
    `insert into ticket_transcripts
      (ticket_id, guild_id, format, content, file_url, generated_by, message_count, attachment_count)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [ticketId, guildId, format, content, fileUrl, generatedBy, messageCount, attachmentCount]
  );
}

async function saveFormAnswers({ ticketId, guildId, answers }) {
  const saved = [];

  for (const item of answers) {
    const row = await db.one(
      `insert into ticket_form_answers
        (ticket_id, question_id, guild_id, question_label, answer)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [ticketId, item.questionId || null, guildId, item.label, item.answer]
    );

    saved.push(row);
  }

  return saved;
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
