const respond = require('../../utils/respond');

module.exports = {
  name: 'urldecode',
  aliases: ["decodeurl"],
  category: 'tools',
  description: "URL-decodes text.",
  usage: "urldecode <text>",
  examples: ["urldecode <text>"],

  async execute({ message, args }) {
    const text = args.join(' ');
    if (!text) return respond.reply(message, 'info', 'need text to decode.');
    try {
      return respond.reply(message, 'info', decodeURIComponent(text));
    } catch {
      return respond.reply(message, 'bad', 'could not decode that URL text.');
    }
  }
};
