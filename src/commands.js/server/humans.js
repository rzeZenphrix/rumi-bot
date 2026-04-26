const respond = require('../../utils/respond');

module.exports = {
  name: 'humans',
  aliases: ["humanlist"],
  category: 'server',
  description: "Shows cached human count.",
  usage: "humans",
  examples: ["humans"],

  async execute({ message, args }) {
    const humans = message.guild.members.cache.filter(m => !m.user.bot);
    return respond.reply(message, 'info', `found **${humans.size}** cached human members.`);
  }
};
