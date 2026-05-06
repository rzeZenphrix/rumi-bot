const respond = require('../../utils/respond');

module.exports = {
  name: 'membercount',
  aliases: ["members", "mc"],
  category: 'server',
  description: "Shows server member count.",
  usage: "membercount",
  examples: ["membercount"],

  async execute({ message, args }) {
    return respond.reply(message, 'info', null, {
      description:
      [
      'Member Count',
      `
      > Total members: **${message.guild.memberCount || message.guild.members.cache.size}**
      > Cached users: **${message.guild.members.cache.filter(m => !m.user.bot).size}**
      > Cached bots: **${message.guild.members.cache.filter(m => m.user.bot).size}**
      `],
    });
  }
};
