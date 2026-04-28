const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

function chunk(items = [], size = 12) {
  const pages = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

module.exports = {
  name: 'serveremojis',
  aliases: ['emojilist'],
  category: 'server',
  description: 'Lists server emojis with pagination.',
  usage: 'serveremojis',
  examples: ['serveremojis'],
  guildOnly: true,

  async execute({ message }) {
    const collection = await message.guild.emojis.fetch().catch(() => message.guild.emojis.cache);
    const emojis = [...collection.values()].sort((left, right) => left.name.localeCompare(right.name));

    if (!emojis.length) {
      return respond.reply(message, 'info', 'I found no server emojis.', { mentionUser: false });
    }

    const pages = chunk(emojis, 12).map((slice, pageIndex, allPages) => ({
      title: `Server emojis | ${message.guild.name}`,
      allowTitle: true,
      description: slice
        .map((emoji, index) => {
          const rank = pageIndex * 12 + index + 1;
          const kind = emoji.animated ? 'Animated' : 'Static';
          return `**${rank}.** ${emoji} \`:${emoji.name}:\`\n\`${emoji.id}\` - ${kind}`;
        })
        .join('\n\n'),
      footer: {
        text: `Page ${pageIndex + 1}/${allPages.length} - ${emojis.length} emojis`
      },
      mentionUser: false
    }));

    const payload = createPagedMessage({
      prefix: 'serveremojis',
      ownerId: message.author.id,
      guildId: message.guild.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
