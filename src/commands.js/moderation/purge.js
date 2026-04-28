const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const { sendLog } = require('../../systems/logging/logDispatcher');
const logger = require('../../systems/logging/logger');

const URL_RE = /https?:\/\/|www\./i;
const INVITE_RE = /(discord\.gg|discord(?:app)?\.com\/invite)\//i;
const CUSTOM_EMOJI_RE = /<a?:[A-Za-z0-9_]{2,32}:\d{17,20}>/;
const UNICODE_EMOJI_RE = /\p{Extended_Pictographic}/u;
const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
const MAX_ATTACHMENT_BYTES = Number(process.env.PURGE_ARCHIVE_MAX_ATTACHMENT_BYTES || 8 * 1024 * 1024);
const MAX_TOTAL_ATTACHMENT_BYTES = Number(process.env.PURGE_ARCHIVE_MAX_TOTAL_ATTACHMENT_BYTES || 24 * 1024 * 1024);

function isSnowflake(value) {
  return /^\d{17,20}$/.test(String(value || ''));
}

function safeFileName(name, fallback = 'attachment') {
  const cleaned = String(name || fallback)
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .slice(0, 90);

  return cleaned || fallback;
}

function messageIsYoungerThan14Days(msg) {
  return Date.now() - msg.createdTimestamp < FOURTEEN_DAYS;
}

function parsePurgeArgs(args) {
  const filters = [];
  let limitToken = args[args.length - 1];
  let limit = Number(limitToken);
  let all = false;

  if (String(limitToken).toLowerCase() === 'all') {
    all = true;
    args.pop();
  } else if (Number.isFinite(limit) && limit > 0) {
    args.pop();
  } else {
    limit = 50;
  }

  const maxAll = Number(process.env.PURGE_MAX_MESSAGES || 1000);
  limit = all ? maxAll : Math.max(1, Math.min(Number(limit || 50), maxAll));

  for (let i = 0; i < args.length; i += 1) {
    const key = String(args[i]).toLowerCase();
    const next = args[i + 1];

    if (['bot', 'bots'].includes(key)) filters.push({ type: 'bots' });
    else if (['human', 'humans'].includes(key)) filters.push({ type: 'humans' });
    else if (key === 'self') filters.push({ type: 'self' });
    else if (key === 'webhooks') filters.push({ type: 'webhooks' });
    else if (key === 'links') filters.push({ type: 'links' });
    else if (key === 'invites') filters.push({ type: 'invites' });
    else if (key === 'stickers') filters.push({ type: 'stickers' });
    else if (key === 'emojis') filters.push({ type: 'emojis' });
    else if (key === 'reactions') filters.push({ type: 'reactions' });
    else if (key === 'files' || key === 'attachments') filters.push({ type: 'files' });
    else if (key === 'embeds') filters.push({ type: 'embeds' });
    else if (key === 'images') filters.push({ type: 'images' });
    else if (key === 'voice') filters.push({ type: 'voice' });
    else if (key === 'system') filters.push({ type: 'system' });
    else if (key === 'mentions') filters.push({ type: 'mentions' });
    else if (key === 'user' && next) { filters.push({ type: 'user', value: next }); i += 1; }
    else if (key === 'contains' && next) { filters.push({ type: 'contains', value: next.toLowerCase() }); i += 1; }
    else if (key === 'startswith' && next) { filters.push({ type: 'startswith', value: next.toLowerCase() }); i += 1; }
    else if (key === 'endswith' && next) { filters.push({ type: 'endswith', value: next.toLowerCase() }); i += 1; }
    else if (key === 'before' && next) { filters.push({ type: 'before', value: next }); i += 1; }
    else if (key === 'after' && next) { filters.push({ type: 'after', value: next }); i += 1; }
    else if (key === 'between' && next && args[i + 2]) { filters.push({ type: 'between', a: next, b: args[i + 2] }); i += 2; }
    else if (key === 'except' && next) { filters.push({ type: 'except', value: next.toLowerCase() }); i += 1; }
  }

  return { filters, limit };
}

function matchesFilters(msg, filters, invokerId) {
  if (!filters.length) return true;
  const content = (msg.content || '').toLowerCase();

  return filters.every((filter) => {
    if (filter.type === 'bots') return msg.author?.bot;
    if (filter.type === 'humans') return !msg.author?.bot;
    if (filter.type === 'self') return msg.author?.id === invokerId;
    if (filter.type === 'webhooks') return Boolean(msg.webhookId);
    if (filter.type === 'links') return URL_RE.test(msg.content || '');
    if (filter.type === 'invites') return INVITE_RE.test(msg.content || '');
    if (filter.type === 'stickers') return msg.stickers?.size > 0;
    if (filter.type === 'emojis') return CUSTOM_EMOJI_RE.test(msg.content || '') || UNICODE_EMOJI_RE.test(msg.content || '');
    if (filter.type === 'reactions') return msg.reactions?.cache?.size > 0;
    if (filter.type === 'files') return msg.attachments?.size > 0;
    if (filter.type === 'embeds') return msg.embeds?.length > 0;
    if (filter.type === 'images') return msg.attachments?.some((a) => String(a.contentType || '').startsWith('image/'));
    if (filter.type === 'voice') return msg.attachments?.some((a) => String(a.contentType || '').startsWith('audio/')) || msg.flags?.has?.('IsVoiceMessage');
    if (filter.type === 'system') return Boolean(msg.system);
    if (filter.type === 'mentions') return msg.mentions?.users?.size > 0 || msg.mentions?.roles?.size > 0 || msg.mentions?.everyone;
    if (filter.type === 'contains') return content.includes(filter.value);
    if (filter.type === 'startswith') return content.startsWith(filter.value);
    if (filter.type === 'endswith') return content.endsWith(filter.value);
    if (filter.type === 'user') return msg.author?.id === extractId(filter.value);
    if (filter.type === 'except') {
      const exceptId = extractId(filter.value);
      if (exceptId) return msg.author?.id !== exceptId;
      return !content.includes(filter.value);
    }
    if (filter.type === 'before') return isSnowflake(filter.value) ? BigInt(msg.id) < BigInt(filter.value) : true;
    if (filter.type === 'after') return isSnowflake(filter.value) ? BigInt(msg.id) > BigInt(filter.value) : true;
    if (filter.type === 'between') {
      if (!isSnowflake(filter.a) || !isSnowflake(filter.b)) return true;
      const id = BigInt(msg.id);
      const a = BigInt(filter.a);
      const b = BigInt(filter.b);
      return id > (a < b ? a : b) && id < (a > b ? a : b);
    }
    return true;
  });
}

async function collectMessages(channel, filters, limit, invokerId) {
  const selected = [];
  let before;
  let scanned = 0;
  const maxScan = Number(process.env.PURGE_MAX_SCAN || 3000);

  while (selected.length < limit && scanned < maxScan) {
    const batch = await channel.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch?.size) break;

    for (const msg of batch.values()) {
      scanned += 1;
      before = msg.id;
      if (!messageIsYoungerThan14Days(msg)) continue;
      if (matchesFilters(msg, filters, invokerId)) selected.push(msg);
      if (selected.length >= limit || scanned >= maxScan) break;
    }

    if (batch.size < 100) break;
  }

  return selected;
}

function buildTranscript(messages, context) {
  const lines = [
    `Rumi purge transcript`,
    `Guild: ${context.guildName} (${context.guildId})`,
    `Channel: #${context.channelName} (${context.channelId})`,
    `Moderator: ${context.moderatorTag} (${context.moderatorId})`,
    `Generated: ${new Date().toISOString()}`,
    `Messages selected: ${messages.length}`,
    ''.padEnd(72, '-'),
    ''
  ];

  const ordered = [...messages].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  for (const msg of ordered) {
    lines.push(`[${new Date(msg.createdTimestamp).toISOString()}] ${msg.author?.tag || 'Unknown'} (${msg.author?.id || 'unknown'}):`);
    lines.push(msg.content || '[no text content]');

    if (msg.attachments?.size) {
      for (const attachment of msg.attachments.values()) {
        lines.push(`Attachment: ${attachment.name || 'file'} | ${attachment.contentType || 'unknown'} | ${attachment.url}`);
      }
    }

    if (msg.stickers?.size) {
      for (const sticker of msg.stickers.values()) {
        lines.push(`Sticker: ${sticker.name} (${sticker.id})`);
      }
    }

    if (msg.embeds?.length) lines.push(`Embeds: ${msg.embeds.length}`);
    lines.push('');
  }

  return Buffer.from(lines.join('\n'), 'utf8');
}

async function fetchAttachmentFile(attachment, index) {
  const size = Number(attachment.size || 0);
  if (size > MAX_ATTACHMENT_BYTES) return null;

  const response = await fetch(attachment.url).catch(() => null);
  if (!response?.ok) return null;

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_ATTACHMENT_BYTES) return null;

  const original = safeFileName(attachment.name || `attachment_${index}`);
  const fileName = `${String(index).padStart(2, '0')}_${original}`;

  return {
    attachment: new AttachmentBuilder(buffer, { name: fileName }),
    bytes: buffer.length
  };
}

async function collectAttachmentFiles(messages) {
  const files = [];
  let totalBytes = 0;
  let index = 1;

  for (const msg of messages) {
    for (const attachment of msg.attachments.values()) {
      if (files.length >= 9) return files;
      if (totalBytes >= MAX_TOTAL_ATTACHMENT_BYTES) return files;

      const file = await fetchAttachmentFile(attachment, index).catch(() => null);
      index += 1;

      if (!file) continue;
      if (totalBytes + file.bytes > MAX_TOTAL_ATTACHMENT_BYTES) continue;

      files.push(file.attachment);
      totalBytes += file.bytes;
    }
  }

  return files;
}

module.exports = {
  name: 'purge',
  aliases: ['prune'],
  category: 'moderation',
  description: 'Bulk delete recent messages using filters and export a transcript.',
  usage: 'purge [messages|bots|user|webhooks|links|embeds|attachments|stickers|emojis|contains <keyword>|before <id>|after <id>|mentions|humans|reactions|files|invites|images] <amount|all>',
  examples: ['purge messages 50', 'purge bots 100', 'purge user @member 25', 'purge contains scam 100', 'purge links all', 'purge embeds 50'],
  guildOnly: true,
  typing: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
  cooldown: 8,

  async execute({ message, args }) {
    const { filters, limit } = parsePurgeArgs([...args]);
    const selected = (await collectMessages(message.channel, filters, limit, message.author.id))
      .filter((entry) => entry.id !== message.id);

    if (!selected.length) {
      return respond.reply(message, 'info', 'I found no matching messages from the last 14 days.');
    }

    const transcript = buildTranscript(selected, {
      guildName: message.guild.name,
      guildId: message.guild.id,
      channelName: message.channel.name,
      channelId: message.channel.id,
      moderatorTag: message.author.tag,
      moderatorId: message.author.id
    });

    const archivedFiles = await collectAttachmentFiles(selected).catch((error) => {
      logger.warn({ error, guildId: message.guild.id, channelId: message.channel.id }, 'Purge attachment archiving failed');
      return [];
    });

    const files = [
      new AttachmentBuilder(transcript, {
        name: `purge-${message.channel.id}-${Date.now()}.txt`
      }),
      ...archivedFiles
    ];

    let deleted = 0;
    for (let i = 0; i < selected.length; i += 100) {
      const chunk = selected.slice(i, i + 100);
      const result = await message.channel.bulkDelete(chunk, true).catch(() => null);
      deleted += result?.size || 0;
    }

    const removedCommand = await message.delete().then(() => 1).catch(() => 0);
    deleted += removedCommand;

    if (!deleted) {
      return respond.reply(message, 'bad', 'I found matching messages, but Discord did not let me delete them. Check Manage Messages and channel access.');
    }

    await sendLog(message.guild, 'moderationAction', {
      title: 'Messages purged',
      actorId: message.author.id,
      channelId: message.channel.id,
      description: `${message.author} purged ${deleted} message(s) in ${message.channel}.`,
      fields: [
        { name: 'Selected', value: String(selected.length), inline: true },
        { name: 'Deleted', value: String(deleted), inline: true }
      ],
      files
    }).catch((error) => {
      logger.warn({ error, guildId: message.guild.id, channelId: message.channel.id }, 'Purge moderation log dispatch failed');
      return null;
    });

    const confirmation = await respond.reply(
      message,
      'good',
      `Deleted **${deleted}** message(s). Discord bulk delete only supports messages younger than 14 days.`,
      {
        useWebhook: false
      }
    );

    if (confirmation?.deletable) {
      setTimeout(() => confirmation.delete().catch(() => null), 5000);
    }

    return confirmation;
  }
};
