const respond = require('./respond');
const emojis = require('./botEmojis');
const { extractId, resolveUser, resolveMember } = require('./resolveUser');
const { logModerationAction } = require('../systems/logging/auditLog');

const REPLY_TYPES = new Set([
  'good',
  'bad',
  'info',
  'alert',
  'add',
  'remove',
  'list'
]);

const STYLE_EMOJI_KEYS = {
  good: ['good', 'success', 'check'],
  bad: ['bad', 'error', 'x'],
  info: ['info', 'information'],
  alert: ['alert', 'warning', 'warn'],
  add: ['add', 'plus'],
  remove: ['remove', 'minus', 'trash', 'delete'],
  list: ['list']
};

const STYLE_FALLBACK_EMOJIS = {
  add: '＋',
  remove: '−'
};

function clean(value, fallback = '') {
  const text = Array.isArray(value)
    ? value.join(' ').trim()
    : String(value ?? '').trim();

  return text || fallback;
}

function hasFlag(args = [], names = []) {
  const wanted = new Set(names.map((name) => String(name).toLowerCase()));
  return args.some((arg) => wanted.has(String(arg || '').toLowerCase()));
}

function stripFlags(args = [], names = []) {
  const wanted = new Set(names.map((name) => String(name).toLowerCase()));
  return args.filter((arg) => !wanted.has(String(arg || '').toLowerCase()));
}

function takeFlagValue(args = [], names = []) {
  const wanted = new Set(names.map((name) => String(name).toLowerCase()));
  const index = args.findIndex((arg) => wanted.has(String(arg || '').toLowerCase()));

  if (index === -1) return null;

  const value = args[index + 1] || '';
  args.splice(index, value ? 2 : 1);

  return value || null;
}

function isEmoji(value) {
  const text = String(value || '').trim();

  return (
    /^<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>$/.test(text) ||
    /\p{Extended_Pictographic}/u.test(text)
  );
}

function emojiForStyle(style) {
  const normalized = String(style || '').toLowerCase();
  const keys = STYLE_EMOJI_KEYS[normalized] || [];

  for (const key of keys) {
    if (emojis[key]) return emojis[key];
    if (emojis[`reply_${key}`]) return emojis[`reply_${key}`];
  }

  return STYLE_FALLBACK_EMOJIS[normalized] || '';
}

function normalizeReplyArgs(defaultType, first, second, third) {
  // ok(message, 'Saved.')
  // ok(message, 'Saved.', { emoji: '✅' })
  if (second === undefined || typeof second === 'object') {
    return {
      type: defaultType,
      text: first,
      options: second || {}
    };
  }

  // ok(message, 'remove', 'Removed role.')
  // ok(message, '<:remove:id>', 'Removed role.')
  const style = String(first || '').trim();
  const text = second;
  const options = third || {};

  if (isEmoji(style)) {
    return {
      type: defaultType,
      text,
      options: {
        ...options,
        emoji: Object.prototype.hasOwnProperty.call(options, 'emoji') ? options.emoji : style
      }
    };
  }

  const lowered = style.toLowerCase();
  const type = REPLY_TYPES.has(lowered) ? lowered : defaultType;
  const styleEmoji = emojiForStyle(lowered);

  return {
    type,
    text,
    options: {
      ...options,
      ...(styleEmoji && !Object.prototype.hasOwnProperty.call(options, 'emoji')
        ? { emoji: styleEmoji }
        : {})
    }
  };
}

function simpleReply(defaultType, message, first, second, third) {
  const parsed = normalizeReplyArgs(defaultType, first, second, third);

  return respond.reply(message, parsed.type, parsed.text, {
    mentionUser: false,
    ...parsed.options
  });
}

function ok(message, first, second, third) {
  return simpleReply('good', message, first, second, third);
}

function bad(message, first, second, third) {
  return simpleReply('bad', message, first, second, third);
}

function info(message, first, second, third) {
  return simpleReply('info', message, first, second, third);
}

function alert(message, first, second, third) {
  return simpleReply('alert', message, first, second, third);
}

async function findUser(client, input) {
  const id = extractId(input);

  if (!id) return null;

  return (
    client.users.cache.get(id) ||
    await client.users.fetch(id).catch(() => null)
  );
}

async function findMember(guild, input) {
  if (!guild) return null;

  const id = extractId(input);

  if (id) {
    return guild.members.cache.get(id) || await guild.members.fetch(id).catch(() => null);
  }

  const query = String(input || '').toLowerCase().trim();
  if (!query) return null;

  const cached = guild.members.cache.find((member) => {
    return (
      member.user.username.toLowerCase() === query ||
      member.user.tag.toLowerCase() === query ||
      member.displayName.toLowerCase() === query ||
      (member.nickname || '').toLowerCase() === query
    );
  });

  if (cached) return cached;

  const found = await guild.members.search({ query, limit: 1 }).catch(() => null);
  return found?.first?.() || null;
}

async function findRole(guild, input) {
  if (!guild) return null;

  const raw = String(input || '').trim();
  const id = raw.match(/^<@&(\d{17,20})>$/)?.[1] || extractId(raw);

  if (id) {
    return guild.roles.cache.get(id) || await guild.roles.fetch(id).catch(() => null);
  }

  const query = raw.toLowerCase();
  if (!query) return null;

  return guild.roles.cache.find((role) =>
    role.name.toLowerCase() === query ||
    role.name.toLowerCase().includes(query)
  ) || null;
}

async function findChannel(guild, input, fallback = null) {
  if (!guild) return null;

  const raw = String(input || '').trim();

  if (!raw) return fallback;

  const id = raw.match(/^<#(\d{17,20})>$/)?.[1] || extractId(raw);

  if (id) {
    return guild.channels.cache.get(id) || await guild.channels.fetch(id).catch(() => null);
  }

  const query = raw.toLowerCase().replace(/^#/, '');

  return guild.channels.cache.find((channel) =>
    channel.name.toLowerCase() === query ||
    channel.name.toLowerCase().includes(query)
  ) || null;
}

async function modlog(message, actionType, userId, reason = 'No reason provided', metadata = {}) {
  return logModerationAction({
    guildId: message.guild.id,
    userId,
    moderatorId: message.author.id,
    actionType,
    reason,
    metadata
  }).catch(() => null);
}

function channelLabel(channel) {
  if (!channel) return 'N/A';
  return channel.toString?.() || `#${channel.name || channel.id}`;
}

function userLabel(userOrMember) {
  if (!userOrMember) return 'Unknown user';

  if (userOrMember.user) {
    return userOrMember.user.tag || userOrMember.user.username || userOrMember.id;
  }

  return userOrMember.tag || userOrMember.username || userOrMember.id || String(userOrMember);
}

module.exports = {
  clean,
  hasFlag,
  stripFlags,
  takeFlagValue,

  ok,
  bad,
  info,
  alert,

  findUser,
  findMember,
  findRole,
  findChannel,

  resolveUser,
  resolveMember,
  extractId,

  modlog,
  channelLabel,
  userLabel
};