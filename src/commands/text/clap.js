const respond = require('../../utils/respond');

module.exports = {
  name: 'clap',
  aliases: ["clapify"],
  category: 'text',
  description: "Turns text into clap text.",
  usage: "clap <text>",
  examples: ["clap <text>"],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need text to clapify.');
    return respond.reply(message, 'info', text.split(/\s+/).join(' 👏 '));
  }
};
