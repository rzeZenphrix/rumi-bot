const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

function chunk(items = [], size = 10) {
  const pages = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

module.exports = {
  name: 'bots',
  aliases: ['botlist'],
  category: 'server',
  description: 'Lists bots in this server.',
  usage: 'bots',
  examples: ['bots'],
  guildOnly: true,

  async execute({ message }) {
    const collection = await message.guild.members.fetch().catch(() => message.guild.members.cache);
    const bots = [...collection.values()]
      .filter((member) => member.user.bot)
      .sort((left, right) => left.user.tag.localeCompare(right.user.tag));

    if (!bots.length) {
      return respond.reply(message, 'info', 'I did not find any bots in this server.', { mentionUser: false });
    }

    const pages = chunk(bots, 10).map((slice, pageIndex, allPages) => ({
      title: `Bots | ${message.guild.name}`,
      allowTitle: true,
      description: slice
        .map((member, index) => {
          const rank = pageIndex * 10 + index + 1;
          const joined = member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : 'Unknown join time';
          return `**${rank}.** ${member.user.tag} (\`${member.id}\`)\nJoined ${joined}`;
        })
        .join('\n\n'),
      footer: {
        text: `Page ${pageIndex + 1}/${allPages.length} - ${bots.length} bots`
      },
      thumbnail: message.guild.iconURL({ dynamic: true }),
      mentionUser: false
    }));

    const payload = createPagedMessage({
      prefix: 'bots',
      ownerId: message.author.id,
      guildId: message.guild.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
