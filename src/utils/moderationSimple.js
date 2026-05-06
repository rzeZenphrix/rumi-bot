const { ChannelType } = require('discord.js');
const respond = require('./respond');
const { extractId } = require('./resolveUser');
const { manageabilityState, moderatabilityState } = require('./permissions');
const { logModerationAction } = require('../systems/logging/auditLog');

function id(input) {
  return String(input || '').match(/\d{17,20}/)?.[0] || null;
}

function clean(text, fallback = 'No reason provided.') {
  const value = String(Array.isArray(text) ? text.join(' ') : text || '').trim();
  return value || fallback;
}

function stripFlags(args, flags = []) {
  const set = new Set(flags);
  return args.filter((arg) => !set.has(String(arg).toLowerCase()));
}

function hasFlag(args, flags = []) {
  const set = new Set(flags);
  return args.some((arg) => set.has(String(arg).toLowerCase()));
}

function plain(message, type, text) {
  return respond.reply(message, type, text, {
    useWebhook: false,
    allowedMentions: { parse: [] }
  });
}

const ok = (message, text) => plain(message, 'good', text);
const bad = (message, text) => plain(message, 'bad', text);
const info = (message, text) => plain(message, 'info', text);

async function findMember(guild, input) {
  const snowflake = id(input);
  if (snowflake) return guild.members.fetch(snowflake).catch(() => null);

  const q = String(input || '').toLowerCase();
  if (!q) return null;

  return guild.members.cache.find((member) =>
    member.user.username.toLowerCase() === q ||
    member.user.tag.toLowerCase() === q ||
    (member.nickname || '').toLowerCase() === q
  ) || guild.members.search({ query: input, limit: 1 }).then((r) => r.first()).catch(() => null);
}

async function findUser(client, input) {
  const snowflake = id(input);
  if (!snowflake) return null;
  return client.users.fetch(snowflake).catch(() => null);
}

async function findRole(guild, input) {
  const snowflake = id(input);
  if (snowflake) return guild.roles.fetch(snowflake).catch(() => null);

  const q = String(input || '').toLowerCase();
  if (!q) return null;

  return guild.roles.cache.find((role) =>
    role.name.toLowerCase() === q ||
    role.name.toLowerCase().includes(q)
  ) || null;
}

async function findChannel(guild, input, fallback = null) {
  const snowflake = id(input);
  if (snowflake) return guild.channels.fetch(snowflake).catch(() => null);

  const q = String(input || '').replace(/^#/, '').toLowerCase();
  if (!q) return fallback;

  return guild.channels.cache.find((channel) =>
    channel.name?.toLowerCase() === q ||
    channel.name?.toLowerCase().includes(q)
  ) || fallback;
}

function canTarget(message, member, mode = 'manage') {
  if (!member) return { ok: false, reason: 'I could not find that member.' };

  const state = mode === 'moderate'
    ? moderatabilityState(message.guild, member)
    : manageabilityState(message.guild, member);

  if (!state.ok) return state;

  if (message.author.id !== message.guild.ownerId) {
    const actor = message.member;
    if (actor?.roles?.highest && member.roles?.highest) {
      if (actor.roles.highest.comparePositionTo(member.roles.highest) <= 0) {
        return { ok: false, reason: 'You cannot target someone with an equal or higher role.' };
      }
    }
  }

  return { ok: true };
}

async function modlog(message, actionType, userId, reason, metadata = {}) {
  return logModerationAction({
    guildId: message.guild.id,
    userId,
    moderatorId: message.author.id,
    actionType,
    reason,
    metadata
  }).catch(() => null);
}

function msgId(input) {
  const raw = String(input || '');
  return raw.match(/\/(\d{17,20})$/)?.[1] || raw.match(/^(\d{17,20})$/)?.[1] || null;
}

function isVoice(channel) {
  return channel && [ChannelType.GuildVoice, ChannelType.GuildStageVoice].includes(channel.type);
}

module.exports = {
  id,
  clean,
  stripFlags,
  hasFlag,
  ok,
  bad,
  info,
  findMember,
  findUser,
  findRole,
  findChannel,
  canTarget,
  modlog,
  msgId,
  isVoice
};
