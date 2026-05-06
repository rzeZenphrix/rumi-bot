const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const logger = require('../logging/logger');

const DISBOARD_BOT_ID = String(process.env.DISBOARD_BOT_ID || '302050872383242240');
const TASK_TYPE = 'disboard_bump_reminder';
const DEFAULT_COOLDOWN_MS = Math.max(
  5 * 60 * 1000,
  Number(process.env.DISBOARD_BUMP_COOLDOWN_MS || 2 * 60 * 60 * 1000)
);

const DEFAULT_REMINDER_MESSAGE = '{ping} **{server}** can be bumped again on Disboard. Run `/bump` now.';
const DEFAULT_SUCCESS_MESSAGE = '✅ Bump detected for **{server}**. I will remind you again {next_bump}.';

function nowIso() {
  return new Date().toISOString();
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function timestamp(value, style = 'R') {
  const iso = toIso(value);
  if (!iso) return 'not set';
  return `<t:${Math.floor(new Date(iso).getTime() / 1000)}:${style}>`;
}

function defaultConfig(guildId = null) {
  return {
    guildId,
    enabled: false,
    autoDetect: true,
    channelId: null,
    pingMode: 'none',
    pingTargetId: null,
    reminderMessage: DEFAULT_REMINDER_MESSAGE,
    successMessage: DEFAULT_SUCCESS_MESSAGE,
    cooldownMs: DEFAULT_COOLDOWN_MS,
    bumpCount: 0,
    lastBumpedAt: null,
    lastBumpedBy: null,
    nextBumpAt: null,
    lastReminderAt: null,
    reminderTaskId: null,
    createdBy: null,
    updatedBy: null,
    createdAt: null,
    updatedAt: null
  };
}

function normalizeMode(mode) {
  return ['none', 'role', 'user', 'here', 'everyone'].includes(mode) ? mode : 'none';
}

function normalizeConfig(row = {}, guildId = null) {
  const base = defaultConfig(guildId || row.guild_id || row.guildId || null);

  return {
    ...base,
    guildId: String(row.guild_id || row.guildId || base.guildId || ''),
    enabled: Boolean(row.enabled),
    autoDetect: row.autodetect_enabled ?? row.autoDetect ?? row.auto_detect ?? base.autoDetect,
    channelId: row.reminder_channel_id || row.channelId || row.channel_id || null,
    pingMode: normalizeMode(row.ping_mode || row.pingMode || base.pingMode),
    pingTargetId: row.ping_target_id || row.pingTargetId || null,
    reminderMessage: String(row.reminder_message || row.reminderMessage || base.reminderMessage).slice(0, 1800),
    successMessage: String(row.success_message || row.successMessage || base.successMessage).slice(0, 1800),
    cooldownMs: Math.max(5 * 60 * 1000, Number(row.cooldown_ms || row.cooldownMs || base.cooldownMs)),
    bumpCount: Math.max(0, Number(row.bump_count || row.bumpCount || 0)),
    lastBumpedAt: toIso(row.last_bumped_at || row.lastBumpedAt),
    lastBumpedBy: row.last_bumped_by || row.lastBumpedBy || null,
    nextBumpAt: toIso(row.next_bump_at || row.nextBumpAt),
    lastReminderAt: toIso(row.last_reminder_at || row.lastReminderAt),
    reminderTaskId: row.reminder_task_id || row.reminderTaskId || null,
    createdBy: row.created_by || row.createdBy || null,
    updatedBy: row.updated_by || row.updatedBy || null,
    createdAt: toIso(row.created_at || row.createdAt),
    updatedAt: toIso(row.updated_at || row.updatedAt)
  };
}

function configToDbPatch(patch = {}) {
  const out = {};

  if ('enabled' in patch) out.enabled = Boolean(patch.enabled);
  if ('autoDetect' in patch) out.autodetect_enabled = patch.autoDetect !== false;
  if ('channelId' in patch) out.reminder_channel_id = patch.channelId ? String(patch.channelId) : null;
  if ('pingMode' in patch) out.ping_mode = normalizeMode(patch.pingMode);
  if ('pingTargetId' in patch) out.ping_target_id = patch.pingTargetId ? String(patch.pingTargetId) : null;
  if ('reminderMessage' in patch) out.reminder_message = String(patch.reminderMessage || DEFAULT_REMINDER_MESSAGE).slice(0, 1800);
  if ('successMessage' in patch) out.success_message = String(patch.successMessage || DEFAULT_SUCCESS_MESSAGE).slice(0, 1800);
  if ('cooldownMs' in patch) out.cooldown_ms = Math.max(5 * 60 * 1000, Number(patch.cooldownMs || DEFAULT_COOLDOWN_MS));
  if ('bumpCount' in patch) out.bump_count = Math.max(0, Number(patch.bumpCount || 0));
  if ('lastBumpedAt' in patch) out.last_bumped_at = toIso(patch.lastBumpedAt);
  if ('lastBumpedBy' in patch) out.last_bumped_by = patch.lastBumpedBy ? String(patch.lastBumpedBy) : null;
  if ('nextBumpAt' in patch) out.next_bump_at = toIso(patch.nextBumpAt);
  if ('lastReminderAt' in patch) out.last_reminder_at = toIso(patch.lastReminderAt);
  if ('reminderTaskId' in patch) out.reminder_task_id = patch.reminderTaskId || null;
  if ('createdBy' in patch) out.created_by = patch.createdBy ? String(patch.createdBy) : null;
  if ('updatedBy' in patch) out.updated_by = patch.updatedBy ? String(patch.updatedBy) : null;

  return out;
}

async function getBumpConfig(guildId) {
  const row = await db.getDisboardBumpSettings(guildId);
  return normalizeConfig(row || defaultConfig(guildId), guildId);
}

async function saveBumpConfig(guildId, patch = {}) {
  const row = await db.upsertDisboardBumpSettings(guildId, configToDbPatch(patch));
  return normalizeConfig(row, guildId);
}

async function logBumpEvent(guildId, eventType, payload = {}) {
  return db.insertDisboardBumpLog({
    guild_id: guildId,
    event_type: eventType,
    actor_user_id: payload.actorUserId || payload.bumpedBy || null,
    channel_id: payload.channelId || null,
    message_id: payload.messageId || null,
    task_id: payload.taskId || null,
    source: payload.source || null,
    metadata: payload.metadata || {}
  }).catch((error) => {
    logger.warn({ error, guildId, eventType }, 'Failed to write Disboard bump log');
    return null;
  });
}

function formatPing(config) {
  if (!config || config.pingMode === 'none') return '';
  if (config.pingMode === 'here') return '@here';
  if (config.pingMode === 'everyone') return '@everyone';
  if (config.pingMode === 'role' && config.pingTargetId) return `<@&${config.pingTargetId}>`;
  if (config.pingMode === 'user' && config.pingTargetId) return `<@${config.pingTargetId}>`;
  return '';
}

function allowedMentionsFor(config, content = '', extraUsers = []) {
  const text = String(content || '');
  const users = new Set(extraUsers.filter(Boolean).map(String));
  const roles = new Set();
  const parse = [];

  if (config?.pingMode === 'user' && config.pingTargetId && text.includes(`<@${config.pingTargetId}>`)) {
    users.add(String(config.pingTargetId));
  }

  if (config?.pingMode === 'role' && config.pingTargetId && text.includes(`<@&${config.pingTargetId}>`)) {
    roles.add(String(config.pingTargetId));
  }

  if ((config?.pingMode === 'here' || config?.pingMode === 'everyone') && /@(here|everyone)\b/.test(text)) {
    parse.push('everyone');
  }

  return { users: [...users], roles: [...roles], parse };
}

function extractTextFromEmbed(embed) {
  const parts = [embed?.title, embed?.description, embed?.author?.name, embed?.footer?.text];

  for (const field of embed?.fields || []) {
    parts.push(field?.name, field?.value);
  }

  return parts.filter(Boolean).join('\n');
}

function messageSearchText(message) {
  return [
    message.content,
    ...(message.embeds || []).map(extractTextFromEmbed)
  ].filter(Boolean).join('\n').toLowerCase();
}

function isSuccessfulDisboardBump(message) {
  const text = messageSearchText(message);
  if (!text) return false;

  const success = [
    /bump done/i,
    /server bumped/i,
    /successfully bumped/i,
    /thank you for bumping/i,
    /bumped your server/i,
    /bump successful/i,
    /done bumping/i
  ].some((pattern) => pattern.test(text));

  const blocked = [
    /please wait/i,
    /try again/i,
    /cooldown/i,
    /not bumped/i,
    /failed/i,
    /error/i,
    /already bumped/i
  ].some((pattern) => pattern.test(text));

  return success && !blocked;
}

function resolveBumpActorId(message) {
  return (
    message.interaction?.user?.id ||
    message.interactionMetadata?.user?.id ||
    message.mentions?.users?.first?.()?.id ||
    null
  );
}

function renderTemplate(template, config, context = {}) {
  const serverName = context.guild?.name || context.guildName || 'this server';
  const ping = formatPing(config);
  const bumpedBy = context.bumpedBy ? `<@${context.bumpedBy}>` : 'someone';
  const map = {
    ping,
    server: serverName,
    guild: serverName,
    bumped_by: bumpedBy,
    user: bumpedBy,
    bump_count: String(config?.bumpCount || 0),
    last_bump: timestamp(config?.lastBumpedAt, 'R'),
    last_bump_time: timestamp(config?.lastBumpedAt, 'f'),
    next_bump: timestamp(context.nextBumpAt || config?.nextBumpAt, 'R'),
    next_bump_time: timestamp(context.nextBumpAt || config?.nextBumpAt, 'f'),
    channel: config?.channelId ? `<#${config.channelId}>` : 'not set'
  };

  return String(template || '')
    .replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, key) => map[key] ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{4,}/g, '\n\n\n')
    .trim()
    .slice(0, 1900);
}

function renderReminderMessage(config, context = {}) {
  return renderTemplate(config.reminderMessage || DEFAULT_REMINDER_MESSAGE, config, context);
}

function renderSuccessMessage(config, context = {}) {
  return renderTemplate(config.successMessage || DEFAULT_SUCCESS_MESSAGE, config, context);
}

function statusLines(config) {
  return [
    `Disboard bump reminders: ${config.enabled ? 'enabled' : 'disabled'}`,
    `Reminder channel: ${config.channelId ? `<#${config.channelId}>` : 'not set'}`,
    `Ping: ${formatPing(config) || 'none'}`,
    `Auto-detect Disboard: ${config.autoDetect ? 'on' : 'off'}`,
    `Cooldown: ${Math.round(Number(config.cooldownMs || DEFAULT_COOLDOWN_MS) / 60000)} minutes`,
    `Last bump: ${timestamp(config.lastBumpedAt)}`,
    `Next reminder: ${timestamp(config.nextBumpAt)}`,
    `Tracked bumps: ${Number(config.bumpCount || 0).toLocaleString()}`,
    '',
    `Reminder text: ${config.reminderMessage || DEFAULT_REMINDER_MESSAGE}`,
    `Success text: ${config.successMessage || DEFAULT_SUCCESS_MESSAGE}`
  ];
}

async function scheduleBumpReminder(guildId, options = {}) {
  const current = await getBumpConfig(guildId);
  if (!current.enabled) return { ok: false, reason: 'disabled', config: current };

  const channelId = options.channelId || current.channelId;
  if (!channelId) return { ok: false, reason: 'missing_channel', config: current };

  const now = Date.now();
  const nextBumpAt = new Date(now + Number(current.cooldownMs || DEFAULT_COOLDOWN_MS)).toISOString();

  await db.completeScheduledTasksByTypeAndGuild?.(TASK_TYPE, guildId).catch((error) => {
    logger.warn({ error, guildId }, 'Failed to close old Disboard bump reminder tasks');
  });

  const task = await db.createScheduledTask({
    guild_id: guildId,
    user_id: options.bumpedBy || null,
    channel_id: channelId,
    task_type: TASK_TYPE,
    run_at: nextBumpAt,
    payload: {
      guildId,
      channelId,
      bumpedBy: options.bumpedBy || null,
      source: options.source || 'manual',
      nextBumpAt,
      createdAt: new Date(now).toISOString()
    }
  });

  const config = await saveBumpConfig(guildId, {
    enabled: true,
    channelId,
    lastBumpedAt: new Date(now).toISOString(),
    lastBumpedBy: options.bumpedBy || null,
    nextBumpAt,
    reminderTaskId: task?.id || null,
    bumpCount: Number(current.bumpCount || 0) + 1,
    updatedBy: options.updatedBy || options.bumpedBy || null
  });

  await logBumpEvent(guildId, options.source === 'disboard_auto_detect' ? 'bump_detected' : 'bump_manual', {
    bumpedBy: options.bumpedBy || null,
    channelId,
    taskId: task?.id || null,
    source: options.source || 'manual',
    metadata: { nextBumpAt }
  });

  return { ok: true, task, config };
}

async function sendPlain(channel, content, allowedMentions) {
  if (!channel?.send || !content) return null;
  return channel.send({ content, allowedMentions });
}

async function sendBumpSuccessNotice(channel, config, context = {}) {
  const content = renderSuccessMessage(config, context);
  const allowedMentions = allowedMentionsFor(config, content, context.bumpedBy ? [context.bumpedBy] : []);
  return sendPlain(channel, content, allowedMentions);
}

async function sendBumpReminder(client, task) {
  const guildId = task.guild_id || task.payload?.guildId;
  if (!guildId) return { ok: false, reason: 'missing_guild' };

  const config = await getBumpConfig(guildId);
  if (!config.enabled) return { ok: false, reason: 'disabled' };

  const taskMatches = !config.reminderTaskId || config.reminderTaskId === task.id;
  const timeMatches = !task.payload?.nextBumpAt || task.payload.nextBumpAt === config.nextBumpAt;

  if (!taskMatches && !timeMatches) {
    return { ok: false, reason: 'stale_task' };
  }

  const channelId = config.channelId || task.channel_id || task.payload?.channelId;
  if (!channelId) return { ok: false, reason: 'missing_channel' };

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel?.send) return { ok: false, reason: 'channel_unavailable' };

  const guild = channel.guild || await client.guilds.fetch(guildId).catch(() => null);
  const content = renderReminderMessage(config, {
    guild,
    bumpedBy: task.user_id || task.payload?.bumpedBy || config.lastBumpedBy,
    nextBumpAt: task.run_at || config.nextBumpAt
  });

  await sendPlain(channel, content, allowedMentionsFor(config, content));

  await saveBumpConfig(guildId, { lastReminderAt: nowIso() }).catch(() => null);
  await logBumpEvent(guildId, 'reminder_sent', {
    channelId,
    taskId: task.id,
    source: 'scheduled_task',
    metadata: { runAt: task.run_at }
  });

  return { ok: true };
}

async function runDueDisboardBumpReminders(client) {
  if (process.env.DISBOARD_BUMP_RUNNER_ENABLED === 'false') {
    return { skipped: true, reason: 'disabled' };
  }

  if (!db.isSupabaseConfigured?.()) return { skipped: true, reason: 'database_not_configured' };
  if (db.getCircuitState?.().open) return { skipped: true, reason: 'database_circuit_open' };

  const tasks = await db.listDueScheduledTasks(TASK_TYPE, nowIso(), 10);

  for (const task of tasks) {
    try {
      await sendBumpReminder(client, task);
      await db.completeScheduledTask(task.id);
    } catch (error) {
      logger.warn({ error, taskId: task.id }, 'Disboard bump reminder task failed');
    }
  }

  return { ok: true, count: tasks.length };
}

async function handleDisboardBumpMessage(message) {
  if (!message?.guild || !message.author?.bot) return false;
  if (String(message.author.id) !== DISBOARD_BOT_ID) return false;

  const config = await getBumpConfig(message.guild.id).catch(() => null);
  if (!config?.enabled || !config.autoDetect) return false;
  if (!isSuccessfulDisboardBump(message)) return false;

  const bumpedBy = resolveBumpActorId(message);
  const result = await scheduleBumpReminder(message.guild.id, {
    channelId: config.channelId || message.channel.id,
    bumpedBy,
    source: 'disboard_auto_detect',
    updatedBy: bumpedBy
  }).catch((error) => {
    logger.warn({ error, guildId: message.guild.id }, 'Failed to schedule Disboard bump reminder from auto-detect');
    return null;
  });

  if (!result?.ok) return false;

  await sendBumpSuccessNotice(message.channel, result.config, {
    guild: message.guild,
    bumpedBy,
    nextBumpAt: result.config.nextBumpAt
  }).catch(() => null);

  return true;
}

async function handleDisboardBumpInteraction() {
  // The bump module is intentionally plain-text only now. No buttons/components.
  return false;
}

function hasManageGuild(member) {
  return Boolean(member?.permissions?.has?.(PermissionFlagsBits.ManageGuild));
}

module.exports = {
  DISBOARD_BOT_ID,
  TASK_TYPE,
  DEFAULT_COOLDOWN_MS,
  DEFAULT_REMINDER_MESSAGE,
  DEFAULT_SUCCESS_MESSAGE,
  getBumpConfig,
  saveBumpConfig,
  logBumpEvent,
  scheduleBumpReminder,
  runDueDisboardBumpReminders,
  handleDisboardBumpMessage,
  handleDisboardBumpInteraction,
  sendBumpSuccessNotice,
  statusLines,
  timestamp,
  formatPing,
  renderReminderMessage,
  renderSuccessMessage,
  allowedMentionsFor,
  hasManageGuild
};
