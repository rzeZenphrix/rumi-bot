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
  name: 'boosters',
  aliases: ['boosts'],
  category: 'server',
  description: 'Lists server boosters.',
  usage: 'boosters',
  examples: ['boosters'],
  guildOnly: true,

  async execute({ message }) {
    const collection = await message.guild.members.fetch().catch(() => message.guild.members.cache);
    const boosters = [...collection.values()]
      .filter((member) => Number(member.premiumSinceTimestamp))
      .sort((left, right) => right.premiumSinceTimestamp - left.premiumSinceTimestamp);

    if (!boosters.length) {
      return respond.reply(message, 'info', 'I could not find any active server boosters here.', { mentionUser: false });
    }

    const pages = chunk(boosters, 10).map((slice, pageIndex, allPages) => ({
      title: `Boosters | ${message.guild.name}`,
      allowTitle: true,
      description: slice
        .map((member, index) => {
          const rank = pageIndex * 10 + index + 1;
          return (
            `**${rank}.** ${member} (${member.user.tag})\n` +
            `Boosting since <t:${Math.floor(member.premiumSinceTimestamp / 1000)}:F> (<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:R>)`
          );
        })
        .join('\n\n'),
      footer: {
        text: `Page ${pageIndex + 1}/${allPages.length} - ${boosters.length} boosters`
      },
      thumbnail: message.guild.iconURL({ dynamic: true }),
      mentionUser: false
    }));

    const payload = createPagedMessage({
      prefix: 'boosters',
      ownerId: message.author.id,
      guildId: message.guild.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
