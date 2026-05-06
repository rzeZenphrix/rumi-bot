const respond = require('../../utils/respond');

module.exports = {
  name: 'rate',
  aliases: ["rateit"],
  category: 'fun',
  description: "Rates something from 0 to 100.",
  usage: "rate <thing>",
  examples: ["rate <thing>"],

  async execute({ message, args }) {
    const thing = args.join(' ').trim();
    if (!thing) return respond.reply(message, 'info', 'need something to rate.');
    const score = Math.floor(Math.random() * 101);
    return respond.reply(message, 'info', `rate **${thing}** a **${score}/100**.`);
  }
};
