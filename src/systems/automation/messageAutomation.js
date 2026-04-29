const db = require('../../services/database');
const logger = require('../logging/logger');
const respond = require('../../utils/respond');
const { parseDuration } = require('../../utils/duration');

const cooldowns = new Map();

function nowIso() {
  return new Date().toISOString();
}

async function queryData(query, context) {
  const { data } = await db.runQuery(query, context);
  return data;
}

function toMatcherMode(value, fallback = 'contains') {
  const mode = String(value || fallback).trim().toLowerCase();
  return ['exact', 'startswith', 'endswith', 'contains', 'match'].includes(mode) ? mode : fallback;
}

function isDurationFlag(token) {
  return ['--within', '--match', '--exact', '--startswith', '--endswith', '--contains', '--languagedetect'].includes(String(token || '').toLowerCase());
}

function parseAutomationFlags(tokens = []) {
  const options = {
    matchMode: 'contains',
    withinSeconds: 0,
    languageDetect: false
  };

  const leftovers = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = String(tokens[index] || '').trim();
    const lower = token.toLowerCase();

    if (lower === '--exact') options.matchMode = 'exact';
    else if (lower === '--startswith') options.matchMode = 'startswith';
    else if (lower === '--endswith') options.matchMode = 'endswith';
    else if (lower === '--contains') options.matchMode = 'contains';
    else if (lower === '--match') options.matchMode = 'match';
    else if (lower === '--languagedetect') options.languageDetect = true;
    else if (lower === '--within') {
      const durationInput = tokens[index + 1];
      const durationMs = parseDuration(durationInput);
      if (durationMs) {
        options.withinSeconds = Math.max(0, Math.round(durationMs / 1000));
        index += 1;
      }
    } else {
      leftovers.push(token);
    }
  }

  return { options, leftovers };
}

function buildCooldownKey(entryType, entryId, guildId, channelId, userId) {
  return `${entryType}:${entryId}:${guildId}:${channelId}:${userId}`;
}

function passesCooldown(entryType, entryId, withinSeconds, message) {
  if (!withinSeconds) return true;
  const key = buildCooldownKey(entryType, entryId, message.guild.id, message.channel.id, message.author.id);
  const now = Date.now();
  const last = cooldowns.get(key) || 0;
  if (now - last < withinSeconds * 1000) {
    return false;
  }
  cooldowns.set(key, now);
  return true;
}

async function translateToEnglish(text) {
  const url = new URL('https://translate.googleapis.com/translate_a/single');
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'auto');
  url.searchParams.set('tl', 'en');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return null;

  const payload = await response.json().catch(() => null);
  if (!Array.isArray(payload?.[0])) return null;

  return payload[0]
    .map((part) => Array.isArray(part) ? part[0] : '')
    .join('')
    .trim()
    .toLowerCase();
}

function matchesTrigger(content, trigger, matchMode) {
  const normalizedContent = String(content || '').trim().toLowerCase();
  const normalizedTrigger = String(trigger || '').trim().toLowerCase();

  if (!normalizedTrigger) return false;

  if (matchMode === 'exact') return normalizedContent === normalizedTrigger;
  if (matchMode === 'startswith') return normalizedContent.startsWith(normalizedTrigger);
  if (matchMode === 'endswith') return normalizedContent.endsWith(normalizedTrigger);
  if (matchMode === 'match') {
    try {
      return new RegExp(trigger, 'iu').test(content || '');
    } catch {
      return false;
    }
  }
  return normalizedContent.includes(normalizedTrigger);
}

function summarizeExclusives(exclusives = []) {
  return exclusives.reduce((map, entry) => {
    const type = String(entry.target_type || '').toLowerCase();
    if (!type) return map;
    map[type] ||= [];
    map[type].push(entry.target_id);
    return map;
  }, {});
}

function matchesExclusives(message, exclusives = []) {
  if (!exclusives.length) return true;

  const grouped = summarizeExclusives(exclusives);
  if (grouped.channel?.length && !grouped.channel.includes(message.channel.id)) {
    return false;
  }
  if (grouped.role?.length) {
    const memberRoles = new Set(message.member?.roles?.cache?.keys?.() || []);
    if (!grouped.role.some((roleId) => memberRoles.has(roleId))) {
      return false;
    }
  }
  if (grouped.user?.length && !grouped.user.includes(message.author.id)) {
    return false;
  }
  return true;
}

async function listAutoresponders(guildId) {
  return queryData(
    db.supabase
      .from('autoresponders')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: true }),
    'listAutoresponders'
  );
}

async function getAutoresponder(guildId, entryId) {
  return queryData(
    db.supabase
      .from('autoresponders')
      .select('*')
      .eq('guild_id', guildId)
      .eq('id', entryId)
      .maybeSingle(),
    'getAutoresponder'
  );
}

async function upsertAutoresponder(row) {
  return queryData(
    db.supabase
      .from('autoresponders')
      .upsert(row)
      .select()
      .single(),
    'upsertAutoresponder'
  );
}

async function removeAutoresponder(guildId, entryId) {
  return queryData(
    db.supabase
      .from('autoresponders')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', entryId)
      .select(),
    'removeAutoresponder'
  );
}

async function listAutoresponderExclusives(guildId, entryId = null) {
  let query = db.supabase
    .from('autoresponder_exclusives')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: true });

  if (entryId) {
    query = query.eq('autoresponder_id', entryId);
  }

  return queryData(query, 'listAutoresponderExclusives');
}

async function addAutoresponderExclusive(guildId, entryId, targetType, targetId) {
  return queryData(
    db.supabase
      .from('autoresponder_exclusives')
      .upsert(
        {
          guild_id: guildId,
          autoresponder_id: entryId,
          target_type: targetType,
          target_id: targetId
        },
        { onConflict: 'autoresponder_id,target_type,target_id' }
      )
      .select()
      .single(),
    'addAutoresponderExclusive'
  );
}

async function removeAutoresponderExclusive(guildId, entryId, targetType, targetId) {
  return queryData(
    db.supabase
      .from('autoresponder_exclusives')
      .delete()
      .eq('guild_id', guildId)
      .eq('autoresponder_id', entryId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .select(),
    'removeAutoresponderExclusive'
  );
}

async function listAutoreactions(guildId) {
  return queryData(
    db.supabase
      .from('autoreactions')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: true }),
    'listAutoreactions'
  );
}

async function getAutoreaction(guildId, entryId) {
  return queryData(
    db.supabase
      .from('autoreactions')
      .select('*')
      .eq('guild_id', guildId)
      .eq('id', entryId)
      .maybeSingle(),
    'getAutoreaction'
  );
}

async function upsertAutoreaction(row) {
  return queryData(
    db.supabase
      .from('autoreactions')
      .upsert(row)
      .select()
      .single(),
    'upsertAutoreaction'
  );
}

async function removeAutoreaction(guildId, entryId) {
  return queryData(
    db.supabase
      .from('autoreactions')
      .delete()
      .eq('guild_id', guildId)
      .eq('id', entryId)
      .select(),
    'removeAutoreaction'
  );
}

async function listAutoreactionExclusives(guildId, entryId = null) {
  let query = db.supabase
    .from('autoreaction_exclusives')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: true });

  if (entryId) {
    query = query.eq('autoreaction_id', entryId);
  }

  return queryData(query, 'listAutoreactionExclusives');
}

async function addAutoreactionExclusive(guildId, entryId, targetType, targetId) {
  return queryData(
    db.supabase
      .from('autoreaction_exclusives')
      .upsert(
        {
          guild_id: guildId,
          autoreaction_id: entryId,
          target_type: targetType,
          target_id: targetId
        },
        { onConflict: 'autoreaction_id,target_type,target_id' }
      )
      .select()
      .single(),
    'addAutoreactionExclusive'
  );
}

async function removeAutoreactionExclusive(guildId, entryId, targetType, targetId) {
  return queryData(
    db.supabase
      .from('autoreaction_exclusives')
      .delete()
      .eq('guild_id', guildId)
      .eq('autoreaction_id', entryId)
      .eq('target_type', targetType)
      .eq('target_id', targetId)
      .select(),
    'removeAutoreactionExclusive'
  );
}

async function handleAutoresponders(message) {
  const entries = await listAutoresponders(message.guild.id).catch(() => []);
  if (!entries.length) return false;

  const exclusives = await listAutoresponderExclusives(message.guild.id).catch(() => []);
  const content = String(message.content || '');
  const normalized = content.toLowerCase();
  let translated = null;

  for (const entry of entries) {
    if (!entry.enabled) continue;
    const entryExclusives = exclusives.filter((exclusive) => exclusive.autoresponder_id === entry.id);
    if (!matchesExclusives(message, entryExclusives)) continue;

    let matched = matchesTrigger(normalized, entry.trigger_text, toMatcherMode(entry.match_mode));
    if (!matched && entry.language_detect) {
      translated ||= await translateToEnglish(content).catch(() => null);
      if (translated) {
        matched = matchesTrigger(translated, entry.trigger_text, toMatcherMode(entry.match_mode));
      }
    }

    if (!matched) continue;
    if (!passesCooldown('autoresponder', entry.id, Number(entry.within_seconds || 0), message)) {
      continue;
    }

    await respond.reply(message, 'info', null, {
      mentionUser: false,
      description: entry.response_text,
      useWebhook: true
    }).catch((error) => {
      logger.warn({ error, guildId: message.guild.id, entryId: entry.id }, 'Autoresponder dispatch failed');
    });
    return true;
  }

  return false;
}

async function handleAutoreactions(message) {
  const entries = await listAutoreactions(message.guild.id).catch(() => []);
  if (!entries.length) return false;

  const exclusives = await listAutoreactionExclusives(message.guild.id).catch(() => []);
  const content = String(message.content || '');

  for (const entry of entries) {
    if (!entry.enabled) continue;
    const entryExclusives = exclusives.filter((exclusive) => exclusive.autoreaction_id === entry.id);
    if (!matchesExclusives(message, entryExclusives)) continue;
    if (!matchesTrigger(content, entry.trigger_text, toMatcherMode(entry.match_mode))) continue;
    if (!passesCooldown('autoreaction', entry.id, Number(entry.within_seconds || 0), message)) continue;

    const reactions = Array.isArray(entry.reactions_json) ? entry.reactions_json : [];
    for (const reaction of reactions.slice(0, 10)) {
      await message.react(reaction).catch(() => null);
    }
    return reactions.length > 0;
  }

  return false;
}

async function handleMessageAutomation(message) {
  const responded = await handleAutoresponders(message).catch(() => false);
  const reacted = await handleAutoreactions(message).catch(() => false);
  return responded || reacted;
}

module.exports = {
  nowIso,
  parseAutomationFlags,
  toMatcherMode,
  isDurationFlag,
  listAutoresponders,
  getAutoresponder,
  upsertAutoresponder,
  removeAutoresponder,
  listAutoresponderExclusives,
  addAutoresponderExclusive,
  removeAutoresponderExclusive,
  listAutoreactions,
  getAutoreaction,
  upsertAutoreaction,
  removeAutoreaction,
  listAutoreactionExclusives,
  addAutoreactionExclusive,
  removeAutoreactionExclusive,
  handleMessageAutomation
};
