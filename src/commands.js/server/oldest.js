const respond = require('../../utils/respond');

module.exports = {
  name: 'oldest',
  aliases: ['oldestmembers'],
  category: 'server',
  description: 'Shows the earliest members to join this server.',
  usage: 'oldest',
  examples: ['oldest'],
  guildOnly: true,

  async execute({ message }) {
    const collection = await message.guild.members.fetch().catch(() => message.guild.members.cache);
    const members = [...collection.values()]
      .filter((member) => Number(member.joinedTimestamp))
      .sort((left, right) => left.joinedTimestamp - right.joinedTimestamp)
      .slice(0, 15);

    if (!members.length) {
      return respond.reply(message, 'bad', 'I could not find any joined-member data for this server.');
    }

    return respond.reply(message, 'info', null, {
      title: `Oldest members | ${message.guild.name}`,
      allowTitle: true,
      description: members
        .map((member, index) => (
          `**${index + 1}.** ${member} (${member.user.tag})\n` +
          `Joined <t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`
        ))
        .join('\n\n'),
      mentionUser: false,
      thumbnail: message.guild.iconURL({ dynamic: true })
    });
  }
};
