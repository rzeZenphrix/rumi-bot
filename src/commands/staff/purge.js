const { PermissionFlagsBits } = require('discord.js');
const { ok, info } = require('../../utils/moderationSimple');
const { extractId } = require('../../utils/resolveUser');
const { sendLog } = require('../../systems/logging/logDispatcher');

const URL_RE = /https?:\/\/|www\./i;
const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\//i;
const EMOJI_RE = /<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>|\p{Extended_Pictographic}/u;
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;

function parsePurgeArgs(args) {
  let limit = Number(args.at(-1));
  if (Number.isFinite(limit)) args.pop();
  else limit = 50;

  limit = Math.max(1, Math.min(limit, Number(process.env.PURGE_MAX_MESSAGES || 500)));

  const filters = [];
  for (let i = 0; i < args.length; i += 1) {
    const key = String(args[i]).toLowerCase();
    const next = args[i + 1];

    if (['bot', 'bots'].includes(key)) filters.push({ type: 'bots' });
    else if (['human', 'humans'].includes(key)) filters.push({ type: 'humans' });
    else if (key === 'self') filters.push({ type: 'self' });
    else if (key === 'links') filters.push({ type: 'links' });
    else if (key === 'invites') filters.push({ type: 'invites' });
    else if (key === 'files' || key === 'attachments') filters.push({ type: 'files' });
    else if (key === 'embeds') filters.push({ type: 'embeds' });
    else if (key === 'emojis') filters.push({ type: 'emojis' });
    else if (key === 'mentions') filters.push({ type: 'mentions' });
    else if (key === 'user' && next) { filters.push({ type: 'user', value: next }); i += 1; }
    else if (key === 'contains' && next) { filters.push({ type: 'contains', value: next.toLowerCase() }); i += 1; }
  }

  return { filters, limit };
}

function matches(msg, filters, invokerId) {
  if (!filters.length) return true;
  const content = (msg.content || '').toLowerCase();

  return filters.every((f) => {
    if (f.type === 'bots') return msg.author?.bot;
    if (f.type === 'humans') return !msg.author?.bot;
    if (f.type === 'self') return msg.author?.id === invokerId;
    if (f.type === 'links') return URL_RE.test(msg.content || '');
    if (f.type === 'invites') return INVITE_RE.test(msg.content || '');
    if (f.type === 'files') return msg.attachments?.size > 0;
    if (f.type === 'embeds') return msg.embeds?.length > 0;
    if (f.type === 'emojis') return EMOJI_RE.test(msg.content || '');
    if (f.type === 'mentions') return msg.mentions?.users?.size || msg.mentions?.roles?.size || msg.mentions?.everyone;
    if (f.type === 'contains') return content.includes(f.value);
    if (f.type === 'user') return msg.author?.id === extractId(f.value);
    return true;
  });
}

async function collectMessages(channel, filters, limit, invokerId) {
  const picked = [];
  let before;

  while (picked.length < limit) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;

    for (const msg of batch.values()) {
      before = msg.id;
      if (Date.now() - msg.createdTimestamp > FOURTEEN_DAYS) continue;
      if (matches(msg, filters, invokerId)) picked.push(msg);
      if (picked.length >= limit) break;
    }

    if (batch.size < 100) break;
  }

  return picked;
}

module.exports = {
  name: 'purge',
  aliases: ['prune'],
  category: 'moderation',
  description: 'Bulk delete recent messages.',
  usage: 'purge [bots|user|links|contains] [amount]',
  examples: ['purge 50', 'purge bots 100', 'purge user @member 25', 'purge contains scam 50'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
  cooldown: 8,

  async execute({ message, args }) {
    const { filters, limit } = parsePurgeArgs([...args]);
    const selected = (await collectMessages(message.channel, filters, limit, message.author.id))
      .filter((msg) => msg.id !== message.id);

    if (!selected.length) return info(message, 'No matching messages found.');

    let deleted = 0;
    for (let i = 0; i < selected.length; i += 100) {
      const chunk = selected.slice(i, i + 100);
      const result = await message.channel.bulkDelete(chunk, true).catch(() => null);
      deleted += result?.size || 0;
    }

    await message.delete().catch(() => null);

    await sendLog(message.guild, 'moderationAction', {
      title: 'Messages purged',
      actorId: message.author.id,
      channelId: message.channel.id,
      description: `${message.author} purged ${deleted} message(s) in ${message.channel}.`
    }).catch(() => null);

    const reply = await ok(message, `Deleted ${deleted} message(s).`);
    if (reply?.deletable) setTimeout(() => reply.delete().catch(() => null), 5000);
    return reply;
  }
};

module.exports.parsePurgeArgs = parsePurgeArgs;
module.exports.collectMessages = collectMessages;