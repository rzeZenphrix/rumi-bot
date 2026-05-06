const respond = require('../../utils/respond');

module.exports = {
  name: 'lowercase',
  aliases: ["lower"],
  category: 'text',
  description: "Lowercases text.",
  usage: "lowercase <text>",
  examples: ["lowercase <text>"],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to lowercase.');
    return respond.reply(message, 'info', text.toLowerCase());
  }
};
