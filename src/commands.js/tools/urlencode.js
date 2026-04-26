const respond = require('../../utils/respond');

module.exports = {
  name: 'urlencode',
  aliases: ["encodeurl"],
  category: 'tools',
  description: "URL-encodes text.",
  usage: "urlencode <text>",
  examples: ["urlencode <text>"],

  async execute({ message, args }) {
    const text = args.join(' ');
    if (!text) return respond.reply(message, 'info', 'need text to encode.');
    return respond.reply(message, 'info', encodeURIComponent(text));
  }
};
