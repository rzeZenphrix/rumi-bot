const respond = require('../../utils/respond');

module.exports = {
  name: 'reversetext',
  aliases: ["revtext","fliptext"],
  category: 'text',
  description: "Reverses text.",
  usage: "reversetext <text>",
  examples: ["reversetext <text>"],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to reverse.');
    return respond.reply(message, 'info', [...text].reverse().join(''));
  }
};
