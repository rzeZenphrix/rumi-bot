const respond = require('../../utils/respond');

module.exports = {
  name: 'spoiler',
  aliases: ["hideword"],
  category: 'text',
  description: "Wraps text in Discord spoiler tags.",
  usage: "spoiler <text>",
  examples: ["spoiler <text>"],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to spoiler.');
    return respond.reply(message, 'info', text.split(/\s+/).map(w => `||${w}||`).join(' '));
  }
};
