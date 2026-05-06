const respond = require('../../utils/respond');

module.exports = {
  name: 'wordcount',
  aliases: ["wc"],
  category: 'text',
  description: "Counts characters, words, and lines.",
  usage: "wordcount <text>",
  examples: ["wordcount <text>"],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to count.');
    const words = text.split(/\s+/).filter(Boolean).length;
    const lines = text.split(/\n/).length;
    return respond.reply(message, 'info', null, {
      description: 'I counted that text.',
      fields: [
        { name: 'Characters', value: String(text.length), inline: true },
        { name: 'Words', value: String(words), inline: true },
        { name: 'Lines', value: String(lines), inline: true }
      ]
    });
  }
};
