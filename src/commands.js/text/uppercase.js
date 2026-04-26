const respond = require('../../utils/respond');

module.exports = {
  name: 'uppercase',
  aliases: ["upper","caps"],
  category: 'text',
  description: "Uppercases text.",
  usage: "uppercase <text>",
  examples: ["uppercase <text>"],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to uppercase.');
    return respond.reply(message, 'info', text.toUpperCase());
  }
};
