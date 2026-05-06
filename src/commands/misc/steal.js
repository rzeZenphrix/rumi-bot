const { PermissionFlagsBits, StickerFormatType } = require('discord.js');
const respond = require('../../utils/respond');
const { fetchBuffer, customEmojiInfos, customEmojiInfo, cleanName, firstAttachment } = require('../../utils/media');

const MAX_EMOJI_BYTES = Number(process.env.EMOJI_MAX_BYTES || 256 * 1024);
const MAX_STICKER_BYTES = Number(process.env.STICKER_MAX_BYTES || 512 * 1024);

async function getRepliedMessage(message) {
  if (!message.reference?.messageId) return null;
  return message.channel.messages.fetch(message.reference.messageId).catch(() => null);
}

function stickerCdnUrl(sticker) {
  if (!sticker) return null;
  if (sticker.url) return sticker.url;

  let ext = 'png';

  if (sticker.format === StickerFormatType.GIF) ext = 'gif';
  if (sticker.format === StickerFormatType.Lottie) ext = 'json';

  return `https://cdn.discordapp.com/stickers/${sticker.id}.${ext}`;
}

function inferType(message, args, replied) {
  const first = String(args[0] || '').toLowerCase();

  if (['emoji', 'emojis', 'emote', 'emotes'].includes(first)) return 'emoji';
  if (['sticker', 'stickers'].includes(first)) return 'sticker';

  if (customEmojiInfo(args.join(' '))) return 'emoji';
  if (replied?.stickers?.size) return 'sticker';
  if (first.startsWith('http')) return 'sticker';

  return '';
}

async function stealEmojis(message, raw) {
  const emojis = customEmojiInfos(raw);

  if (!emojis.length) {
    return respond.reply(message, 'info', 'Use `steal emoji <customEmoji> [more...]` or just `steal <customEmoji>`.');
  }

  const added = [];
  const failed = [];
  const existingNames = new Set(message.guild.emojis.cache.map((emoji) => emoji.name.toLowerCase()));
  const maxSlots = Number(message.guild.maximumEmojis || 50);
  const openSlots = Math.max(0, maxSlots - message.guild.emojis.cache.size);

  if (!openSlots) {
    return respond.reply(message, 'bad', 'I couldn’t add an emoji because this server has no emoji slots left.');
  }

  for (const emoji of emojis.slice(0, Math.min(20, openSlots))) {
    const name = cleanName(emoji.name, 'emoji');

    if (existingNames.has(name.toLowerCase())) {
      failed.push(`${emoji.name} (duplicate name)`);
      continue;
    }

    const buffer = await fetchBuffer(emoji.url, { maxBytes: MAX_EMOJI_BYTES }).catch(() => null);
    if (!buffer) {
      failed.push(`${emoji.name} (could not fetch or too large)`);
      continue;
    }

    const created = await message.guild.emojis
      .create({
        attachment: buffer,
        name,
        reason: `Emoji stolen by ${message.author.tag}`
      })
      .catch(() => null);

    if (created) {
      added.push(`${created}`);
      existingNames.add(name.toLowerCase());
    } else {
      failed.push(`${emoji.name} (Discord rejected it)`);
    }
  }

  return respond.reply(
    message,
    added.length ? 'good' : 'bad',
    `I stole **${added.length}** emoji(s)${failed.length ? ` and skipped **${failed.length}**` : ''}: ${added.join(' ') || 'none'}`
  );
}

async function stealSticker(message, args, replied) {
  const repliedSticker = replied?.stickers?.first?.() || null;
  const repliedAttachment = replied ? firstAttachment(replied) : null;

  let url = args[0];
  let nameArgs = args.slice(1);

  if (!/^https?:\/\//i.test(String(url || ''))) {
    url = stickerCdnUrl(repliedSticker) || repliedAttachment?.url || null;
    nameArgs = args;
  }

  const name = cleanName(
    nameArgs.join('_') || repliedSticker?.name || repliedAttachment?.name?.replace(/\.[a-z0-9]+$/i, '') || 'sticker',
    'sticker'
  );

  if (!url) {
    return respond.reply(
      message,
      'info',
      'Reply to a sticker/image attachment or use `steal sticker <url> [name]`.'
    );
  }

  const maxSlots = Number(message.guild.maximumStickers || 5);
  if (message.guild.stickers.cache.size >= maxSlots) {
    return respond.reply(message, 'bad', 'I couldn’t add a sticker because this server has no sticker slots left.');
  }

  if (message.guild.stickers.cache.some((sticker) => sticker.name.toLowerCase() === name.toLowerCase())) {
    return respond.reply(message, 'bad', `I couldn’t add that sticker because **${name}** already exists.`);
  }

  const buffer = await fetchBuffer(url, { maxBytes: MAX_STICKER_BYTES }).catch(() => null);
  if (!buffer) {
    return respond.reply(message, 'bad', 'I couldn’t fetch that sticker image, or the file is too large.');
  }

  const sticker = await message.guild.stickers.create({
    file: { attachment: buffer, name: `${name}.png` },
    name,
    tags: '🙂',
    description: `Stolen by ${message.author.tag}`,
    reason: `Sticker stolen by ${message.author.tag}`
  }).catch(() => null);

  if (!sticker) {
    return respond.reply(message, 'bad', 'I couldn’t add that sticker. Discord may have rejected the image format or size.');
  }

  return respond.reply(message, 'good', `I stole sticker **${sticker.name}**.`);
}

module.exports = {
  name: 'steal',
  aliases: ['yoink', 'take'],
  category: 'sticker',
  description: 'Steal external emojis or stickers.',
  usage: 'steal [emoji|sticker] ...',
  examples: [
    'steal <:blob:123456789012345678>',
    'steal emoji <:one:123> <:two:456>',
    'steal sticker FunnySticker',
    'steal sticker https://cdn.discordapp.com/stickers/123.png FunnySticker'
  ],
  subcommands: [
    {
      name: 'emoji',
      description: 'Adds one or more custom emojis to this server.',
      usage: 'emoji <emoji...>',
      examples: ['steal emoji <:blob:123456789012345678>']
    },
    {
      name: 'sticker',
      description: 'Adds a sticker from a replied sticker, image attachment, or sticker URL.',
      usage: 'sticker [url] [name]',
      examples: ['steal sticker FunnySticker', 'steal sticker <url> FunnySticker']
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuildExpressions],
  botPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  cooldown: 5,

  async execute({ message, args }) {
    const replied = await getRepliedMessage(message);
    const type = inferType(message, args, replied);

    if (['emoji', 'emojis', 'emote', 'emotes', 'sticker', 'stickers'].includes(String(args[0] || '').toLowerCase())) {
      args.shift();
    }

    if (type === 'emoji') {
      return stealEmojis(message, args.join(' '));
    }

    if (type === 'sticker') {
      return stealSticker(message, args, replied);
    }

    return respond.reply(message, 'info', 'Use `steal <emoji>`, `steal emoji <emoji...>`, or reply to a sticker with `steal sticker`.');
  }
};
