const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { fetchBuffer, firstAttachment, cleanName } = require('../../utils/media');
const { extractId } = require('../../utils/resolveUser');

const MAX_STICKER_BYTES = Number(process.env.STICKER_MAX_BYTES || 512 * 1024);

async function resolveSticker(guild, input) {
  const id = extractId(input);
  if (id) return guild.stickers.fetch(id).catch(() => null);
  const q = String(input || '').toLowerCase();
  return guild.stickers.cache.find((s) => s.name.toLowerCase() === q) || null;
}

module.exports = {
  name: 'sticker',
  aliases: ['stickers'],
  category: 'misc',
  description: 'Rename, add, list, or remove server stickers.',
  usage: 'sticker <rename|add|list|remove> ...',
  examples: ['sticker add funny <attachment|url>', 'sticker rename old new', 'sticker list', 'sticker remove funny'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuildExpressions],
  botPermissions: [PermissionFlagsBits.ManageGuildExpressions],
  cooldown: 5,

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();

    if (sub === 'add') {
      const name = cleanName(args.shift(), 'sticker');
      const attachment = firstAttachment(message);
      const url = args.shift() || attachment?.url;
      if (!name || !url) return respond.reply(message, 'info', 'Usage: `sticker add <name> <attachment|url>`.');

      const maxSlots = Number(message.guild.maximumStickers || 5);
      if (message.guild.stickers.cache.size >= maxSlots) {
        return respond.reply(message, 'bad', 'I couldn’t add a sticker because this server has no sticker slots left.');
      }

      if (message.guild.stickers.cache.some((sticker) => sticker.name.toLowerCase() === name.toLowerCase())) {
        return respond.reply(message, 'bad', `I couldn’t add that sticker because **${name}** already exists.`);
      }

      const buffer = await fetchBuffer(url, { maxBytes: MAX_STICKER_BYTES }).catch(() => null);
      if (!buffer) return respond.reply(message, 'bad', 'I couldn’t fetch that sticker image, or the file is too large.');

      const sticker = await message.guild.stickers.create({
        file: buffer,
        name,
        tags: name,
        description: `Added by ${message.author.tag}`,
        reason: `Sticker added by ${message.author.tag}`
      }).catch(() => null);
      if (!sticker) return respond.reply(message, 'bad', 'I couldn’t add that sticker. Discord may have rejected the image format or size.');
      return respond.reply(message, 'good', `Added sticker **${sticker.name}**.`);
    }

    if (sub === 'rename') {
      const sticker = await resolveSticker(message.guild, args.shift());
      const name = cleanName(args.join('_'), 'sticker');
      if (!sticker || !name) return respond.reply(message, 'info', 'Usage: `sticker rename <sticker|id|name> <newName>`.');
      await sticker.edit({ name, reason: `Sticker renamed by ${message.author.tag}` });
      return respond.reply(message, 'good', `Renamed sticker to **${name}**.`);
    }

    if (sub === 'remove' || sub === 'delete') {
      const sticker = await resolveSticker(message.guild, args.join(' '));
      if (!sticker) return respond.reply(message, 'info', 'Usage: `sticker remove <sticker|id|name>`.');
      const name = sticker.name;
      await sticker.delete(`Sticker removed by ${message.author.tag}`);
      return respond.reply(message, 'good', `Removed sticker **${name}**.`);
    }

    if (sub === 'list') {
      await message.guild.stickers.fetch().catch(() => null);
      const lines = message.guild.stickers.cache.map((s) => `**${s.name}** — \`${s.id}\``).join('\n');
      return respond.reply(message, 'info', null, { title: `Stickers (${message.guild.stickers.cache.size})`, description: lines.slice(0, 4096) || 'No stickers found.' });
    }

    return respond.reply(message, 'info', 'Usage: `sticker <rename|add|list|remove> ...`.');
  }
};
