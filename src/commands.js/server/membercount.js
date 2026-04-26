const respond = require('../../utils/respond');

module.exports = {
  name: 'membercount',
  aliases: ["members"],
  category: 'server',
  description: "Shows server member count.",
  usage: "membercount",
  examples: ["membercount"],

  async execute({ message, args }) {
    return respond.reply(message, 'info', null, {
      description: 'I counted the server members.',
      fields: [
        { name: 'Members', value: String(message.guild.memberCount || message.guild.members.cache.size), inline: true },
        { name: 'Cached users', value: String(message.guild.members.cache.filter(m => !m.user.bot).size), inline: true },
        { name: 'Cached bots', value: String(message.guild.members.cache.filter(m => m.user.bot).size), inline: true }
      ]
    });
  }
};
