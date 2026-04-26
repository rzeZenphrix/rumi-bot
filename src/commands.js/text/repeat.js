const respond = require('../../utils/respond');

module.exports = {
  name: 'repeat',
  aliases: ["reptext"],
  category: 'text',
  description: "Repeats text a safe number of times.",
  usage: "repeat <2-10> <text>",
  examples: ["repeat <2-10> <text>"],

  async execute({ message, args }) {
    const count = Math.min(10, Math.max(2, Number(args.shift()) || 2));
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to repeat.');
    return respond.reply(message, 'info', Array(count).fill(text).join('\n').slice(0, 3900));
  }
};
