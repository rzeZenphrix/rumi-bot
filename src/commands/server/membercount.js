const respond = require('../../utils/respond');
const { fetchAllGuildMembers } = require('../../utils/memberFetch');

module.exports = {
  name: 'membercount',
  aliases: ["members", "mc"],
  category: 'server',
  description: "Shows server member count.",
  usage: "membercount",
  examples: ["membercount"],

  guildOnly: true,

  async execute({ message }) {
    let fetchedMembers;
    try {
      fetchedMembers = await fetchAllGuildMembers(message.guild);
    } catch (error) {
      return respond.reply(message, 'bad', error.message, { mentionUser: false });
    }

    const users = fetchedMembers.filter((member) => !member.user.bot).size;
    const bots = fetchedMembers.filter((member) => member.user.bot).size;
    const total = fetchedMembers.size;

    return respond.reply(message, 'info', null, {
      title: 'Member Count',
      description: [
        `> Total members: **${total.toLocaleString()}**`,
        `> Users: **${users.toLocaleString()}**`,
        `> Bots: **${bots.toLocaleString()}**`
      ].join('\n'),
      footer: { text: 'Fetched live from Discord, not read from member cache.' },
      mentionUser: false
    });
  }
};
