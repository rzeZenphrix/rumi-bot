const respond = require('../../utils/respond');

module.exports = {
  name: 'mocktext',
  aliases: ['sarcasm'],
  category: 'text',
  description: "Turns text into alternating mock case.",
  usage: "mocktext <text>",
  examples: ["mocktext <text>"],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to mock.');
    const out = [...text].map((c, i) => i % 2 ? c.toLowerCase() : c.toUpperCase()).join('');
    return respond.reply(message, 'info', out);
  }
};
