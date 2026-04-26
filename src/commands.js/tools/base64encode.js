const respond = require('../../utils/respond');

module.exports = {
  name: 'base64encode',
  aliases: ["b64e"],
  category: 'tools',
  description: "Encodes text to Base64.",
  usage: "base64encode <text>",
  examples: ["base64encode <text>"],

  async execute({ message, args }) {
    const text = args.join(' ');
    if (!text) return respond.reply(message, 'info', 'need text to encode.');
    return respond.reply(message, 'info', Buffer.from(text, 'utf8').toString('base64'));
  }
};
