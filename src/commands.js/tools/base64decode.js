const respond = require('../../utils/respond');

module.exports = {
  name: 'base64decode',
  aliases: ["b64d"],
  category: 'tools',
  description: "Decodes Base64 text.",
  usage: "base64decode <text>",
  examples: ["base64decode <text>"],

  async execute({ message, args }) {
    const text = args.join('');
    if (!text) return respond.reply(message, 'info', 'need Base64 text to decode.');
    try {
      return respond.reply(message, 'info', Buffer.from(text, 'base64').toString('utf8'));
    } catch {
      return respond.reply(message, 'bad', 'could not decode that Base64 text.');
    }
  }
};
