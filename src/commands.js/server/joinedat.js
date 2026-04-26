const respond = require('../../utils/respond');

module.exports = {
  name: 'joinedat',
  aliases: ["joined"],
  category: 'server',
  description: "Shows when a member joined.",
  usage: "joinedat [user]",
  examples: ["joinedat [user]"],

  async execute({ message, args }) {
    const member = message.mentions.members.first() || message.member;
    return respond.reply(message, 'info', `${member} joined <t:${Math.floor(member.joinedTimestamp / 1000)}:F> (<t:${Math.floor(member.joinedTimestamp / 1000)}:R>).`);
  }
};
