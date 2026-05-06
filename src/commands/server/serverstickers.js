const { StickerFormatType } = require('discord.js');
const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

const FORMAT_NAMES = {
  [StickerFormatType.PNG]: 'PNG',
  [StickerFormatType.APNG]: 'APNG',
  [StickerFormatType.Lottie]: 'Lottie',
  [StickerFormatType.GIF]: 'GIF'
};

module.exports = {
  name: 'serverstickers',
  aliases: ['stickerlist'],
  category: 'server',
  description: 'Browse server stickers one by one.',
  usage: 'serverstickers',
  examples: ['serverstickers'],
  guildOnly: true,

  async execute({ message }) {
    const collection = await message.guild.stickers.fetch().catch(() => message.guild.stickers.cache);
    const stickers = [...collection.values()].sort((left, right) => left.name.localeCompare(right.name));

    if (!stickers.length) {
      return respond.reply(message, 'info', 'I found no server stickers.', { mentionUser: false });
    }

    const pages = stickers.map((sticker, index) => ({
      title: `Sticker ${index + 1}/${stickers.length} | ${sticker.name}`,
      allowTitle: true,
      description: sticker.description || 'No sticker description set.',
      image: sticker.url || null,
      fields: [
        { name: 'Sticker ID', value: `\`${sticker.id}\``, inline: true },
        { name: 'Format', value: FORMAT_NAMES[sticker.format] || 'Unknown', inline: true },
        { name: 'Tags', value: sticker.tags || 'None', inline: false }
      ],
      footer: {
        text: `Server stickers - ${message.guild.name}`
      },
      mentionUser: false
    }));

    const payload = createPagedMessage({
      prefix: 'serverstickers',
      ownerId: message.author.id,
      guildId: message.guild.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
