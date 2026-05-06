const db = require('../../services/database');
const respond = require('../../utils/respond');
const logger = require('../logging/logger');
const { requireUserPremium } = require('../monetization/access');

const AFK_PREFIX = '[afk] ';

function scopeKey(scopeType, guildId = null) {
  return scopeType === 'global' ? 'global' : String(guildId || '');
}

async function queryData(query, context) {
  const { data } = await db.runQuery(query, context);
  return data;
}

async function getAfkState(scopeType, guildId, userId) {
  return queryData(
    db.supabase
      .from('afk_states')
      .select('*')
      .eq('scope_key', scopeKey(scopeType, guildId))
      .eq('user_id', userId)
      .maybeSingle(),
    'getAfkState'
  );
}

async function listRelevantAfkStates(userId, guildId) {
  return queryData(
    db.supabase
      .from('afk_states')
      .select('*')
      .eq('user_id', userId)
      .in('scope_key', [scopeKey('global'), scopeKey('guild', guildId)])
      .order('created_at', { ascending: true }),
    'listRelevantAfkStates'
  );
}

async function upsertAfkState(row) {
  return queryData(
    db.supabase
      .from('afk_states')
      .upsert(row, { onConflict: 'scope_key,user_id' })
      .select()
      .single(),
    'upsertAfkState'
  );
}

async function deleteAfkState(stateId) {
  return queryData(
    db.supabase
      .from('afk_states')
      .delete()
      .eq('id', stateId)
      .select(),
    'deleteAfkState'
  );
}

async function listAfkPingLogs(stateIds = []) {
  if (!stateIds.length) return [];

  return queryData(
    db.supabase
      .from('afk_ping_logs')
      .select('*')
      .in('afk_state_id', stateIds)
      .order('created_at', { ascending: true }),
    'listAfkPingLogs'
  );
}

async function insertAfkPingLog(row) {
  return queryData(
    db.supabase
      .from('afk_ping_logs')
      .insert(row)
      .select()
      .single(),
    'insertAfkPingLog'
  );
}

async function deleteAfkPingLogs(stateIds = []) {
  if (!stateIds.length) return [];

  return queryData(
    db.supabase
      .from('afk_ping_logs')
      .delete()
      .in('afk_state_id', stateIds)
      .select(),
    'deleteAfkPingLogs'
  );
}

function formatAfkDurationShort(createdAt) {
  const started = new Date(createdAt).getTime();
  const diffMs = Date.now() - started;
  const seconds = Math.max(0, Math.floor(diffMs / 1000));

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;

  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function plural(value, one, many = `${one}s`) {
  return `${value} ${value === 1 ? one : many}`;
}

function formatAfkDurationLong(createdAt) {
  const started = new Date(createdAt).getTime();
  const diffMs = Date.now() - started;
  const totalSeconds = Math.max(0, Math.floor(diffMs / 1000));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];

  if (days) parts.push(plural(days, 'day'));
  if (hours) parts.push(plural(hours, 'hour'));
  if (minutes) parts.push(plural(minutes, 'minute'));
  if (!parts.length || seconds) parts.push(plural(seconds, 'second'));

  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;

  return `${parts.slice(0, -1).join(', ')}, and ${parts.at(-1)}`;
}

function afkNicknameFor(member) {
  const base = member.nickname || member.user.globalName || member.user.username;
  const trimmed = String(base || '').replace(/^\[afk\]\s*/i, '').trim();
  return `${AFK_PREFIX}${trimmed}`.slice(0, 32);
}

async function applyAfkNickname(member) {
  if (!member.manageable) {
    return {
      ok: false,
      reason: 'I could not change your nickname in this server.'
    };
  }

  const original = member.nickname || null;
  const nickname = afkNicknameFor(member);

  await member.setNickname(nickname, 'AFK rename');

  return {
    ok: true,
    original,
    nickname
  };
}

async function restoreNickname(member, originalNickname) {
  if (!member?.manageable) return false;

  await member.setNickname(originalNickname || null, 'AFK cleared').catch(() => null);
  return true;
}

async function setAfk(member, scopeType, reason, renameEnabled = false) {
  const current = await getAfkState(scopeType, member.guild.id, member.id).catch(() => null);
  let renameResult = null;

  if (renameEnabled) {
    renameResult = await applyAfkNickname(member);
  }

  return upsertAfkState({
    id: current?.id,
    scope_key: scopeKey(scopeType, member.guild.id),
    scope_type: scopeType,
    guild_id: scopeType === 'guild' ? member.guild.id : null,
    user_id: member.id,
    reason: String(reason || '').trim() || null,
    rename_enabled: Boolean(renameEnabled),
    original_nickname: renameResult?.original ?? current?.original_nickname ?? member.nickname ?? null,
    applied_nickname: renameResult?.nickname ?? current?.applied_nickname ?? null,
    metadata_json: {
      setBy: member.id
    }
  });
}

async function clearAfkStatesForMember(member, states) {
  if (!states.length) {
    return {
      logs: [],
      oldestState: null
    };
  }

  const stateIds = states.map((entry) => entry.id);
  const logs = await listAfkPingLogs(stateIds).catch(() => []);
  const oldestState = states[0] || null;

  for (const state of states) {
    if (member && state.rename_enabled) {
      await restoreNickname(member, state.original_nickname).catch(() => null);
    }

    await deleteAfkState(state.id).catch(() => null);
  }

  await deleteAfkPingLogs(stateIds).catch(() => null);

  return {
    logs,
    oldestState
  };
}

async function sendAfkReturnSummary(message, logs = [], oldestState = null) {
  const duration = oldestState?.created_at
    ? formatAfkDurationLong(oldestState.created_at)
    : 'a while';

  const extra = logs.length
    ? ` I logged ${logs.length} ping${logs.length === 1 ? '' : 's'} while you were gone.`
    : '';

  await respond.reply(
    message,
    'info',
    `👋 ${message.author}: Welcome back, you went away ${duration}.${extra}`,
    {
      mentionUser: false,
      useWebhook: false
    }
  ).catch(() => null);

  if (!logs.length) return;

  const dmLines = logs.slice(-20).map((entry) => {
    const at = new Date(entry.created_at).toLocaleString('en-GB', {
      timeZone: 'UTC',
      dateStyle: 'medium',
      timeStyle: 'short'
    });

    return `- ${at} UTC by <@${entry.pinged_by_user_id}>${entry.message_url ? ` | ${entry.message_url}` : ''}`;
  });

  await message.author.send({
    content: [
      'Recent pings while you were AFK:',
      ...dmLines
    ].join('\n'),
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function clearAfkByCommand(member) {
  const states = await listRelevantAfkStates(member.id, member.guild?.id || null).catch(() => []);

  if (!states.length) return false;

  await clearAfkStatesForMember(member, states).catch(() => null);
  return true;
}

async function clearAfkForMessage(message) {
  const states = await listRelevantAfkStates(message.author.id, message.guild?.id || null).catch(() => []);

  if (!states.length) return false;

  const cleared = await clearAfkStatesForMember(message.member || null, states).catch(() => ({
    logs: [],
    oldestState: states[0] || null
  }));

  await sendAfkReturnSummary(message, cleared.logs || [], cleared.oldestState || states[0] || null).catch(() => null);

  return true;
}

async function handleAfkMentions(message) {
  if (!message.guild || message.author.bot) return false;

  const mentionedUsers = [
    ...new Set(
      message.mentions.users
        .filter((user) => user.id !== message.author.id && !user.bot)
        .map((user) => user.id)
    )
  ];

  if (!mentionedUsers.length) return false;

  const lines = [];

  for (const userId of mentionedUsers.slice(0, 10)) {
    const states = await listRelevantAfkStates(userId, message.guild.id).catch(() => []);
    const active = states[0];

    if (!active) continue;

    await insertAfkPingLog({
      afk_state_id: active.id,
      scope_key: active.scope_key,
      guild_id: message.guild.id,
      user_id: userId,
      channel_id: message.channel.id,
      message_id: message.id,
      message_url: message.url,
      pinged_by_user_id: message.author.id
    }).catch(() => null);

    const member = message.guild.members.cache.get(userId) ||
      await message.guild.members.fetch(userId).catch(() => null);

    const label = member ? `${member}` : `<@${userId}>`;
    const reason = active.reason ? ` with the status: \`${active.reason}\`` : '';
    const duration = formatAfkDurationShort(active.created_at);

    lines.push(`💤 ${label} is afk${reason} • away for **${duration}**`);
  }

  if (!lines.length) return false;

  await respond.reply(message, 'info', lines.join('\n'), {
    mentionUser: false,
    useWebhook: false
  }).catch((error) => {
    logger.warn({ error, guildId: message.guild.id }, 'AFK mention notice failed');
  });

  return true;
}

async function requireAfkRenamePremium(message) {
  return requireUserPremium(message, 'AFK rename');
}

module.exports = {
  AFK_PREFIX,
  getAfkState,
  listRelevantAfkStates,
  setAfk,
  clearAfkByCommand,
  clearAfkForMessage,
  handleAfkMentions,
  requireAfkRenamePremium
};