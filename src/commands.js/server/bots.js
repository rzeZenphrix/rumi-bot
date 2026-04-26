const respond = require('../../utils/respond');

module.exports = {
  name: 'bots',
  aliases: ["botlist"],
  category: 'server',
  description: "Lists cached bots.",
  usage: "bots",
  examples: ["bots"],

  async execute({ message, args }) {
    const bots = message.guild.members.cache.filter(m => m.user.bot).first(20);
    return respond.reply(message, 'info', bots.map(m => `${m.user.tag} (\`${m.id}\`)`).join('\n') || 'I found no cached bots.');
  }
};
