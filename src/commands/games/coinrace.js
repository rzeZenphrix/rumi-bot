const respond = require('../../utils/respond');

module.exports = {
  name: 'coinrace',
  aliases: ["racecoin"],
  category: 'fun',
  description: "Runs a tiny coin race.",
  usage: "coinrace",
  examples: ["coinrace"],

  async execute({ message, args }) {
    const winner = Math.random() > 0.5 ? 'heads' : 'tails';
    return respond.reply(message, 'info', `ran the race and **${winner}** won.`);
  }
};
