const { PermissionFlagsBits, StickerFormatType } = require('discord.js');
const respond = require('../../utils/respond');
const { fetchBuffer, customEmojiInfos, cleanName, firstAttachment } = require('../../utils/media');

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

module.exports = {
  name: 'steal',
  aliases: ['yoink', 'take'],
  category: 'sticker',
  description: 'Steal external emojis or stickers.',
  usage: 'steal <emoji|sticker> ...',
  examples: [
    'steal emoji <:blob:123456789012345678>',
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

  async execute({ message, args }) {
    const type = (args.shift() || '').toLowerCase();

    if (type === 'emoji' || type === 'emojis') {
      const emojis = customEmojiInfos(args.join(' '));

      if (!emojis.length) {
        return respond.reply(message, 'info', 'Usage: `steal emoji <customEmoji> [more...]`.');
      }

      const added = [];

      for (const emoji of emojis.slice(0, 20)) {
        const buffer = await fetchBuffer(emoji.url).catch(() => null);
        if (!buffer) continue;

        const created = await message.guild.emojis
          .create({
            attachment: buffer,
            name: cleanName(emoji.name),
            reason: `Emoji stolen by ${message.author.tag}`
          })
          .catch(() => null);

        if (created) added.push(`${created}`);
      }

      return respond.reply(
        message,
        added.length ? 'good' : 'bad',
        `Stole **${added.length}** emoji(s): ${added.join(' ') || 'none'}`
      );
    }

    if (type === 'sticker') {
      const replied = await getRepliedMessage(message);
      const repliedSticker = replied?.stickers?.first?.() || null;
      const repliedAttachment = replied ? firstAttachment(replied) : null;

      let url = args[0];
      let nameArgs = args.slice(1);

      if (!/^https?:\/\//i.test(String(url || ''))) {
        url = stickerCdnUrl(repliedSticker) || repliedAttachment?.url || null;
        nameArgs = args;
      }

      const name = cleanName(nameArgs.join('_') || repliedSticker?.name || repliedAttachment?.name || 'sticker', 'sticker');

      if (!url) {
        return respond.reply(
          message,
          'info',
          'Reply to a sticker/image attachment or use: `steal sticker <url> [name]`.'
        );
      }

      const buffer = await fetchBuffer(url);
      const filename = `${name}.png`;

      const sticker = await message.guild.stickers.create({
        file: { attachment: buffer, name: filename },
        name,
        tags: '🙂',
        description: `Stolen by ${message.author.tag}`,
        reason: `Sticker stolen by ${message.author.tag}`
      });

      return respond.reply(message, 'good', `Stole sticker **${sticker.name}**.`);
    }

    return respond.reply(message, 'info', 'Usage: `steal <emoji|sticker> ...`.');
  }
};