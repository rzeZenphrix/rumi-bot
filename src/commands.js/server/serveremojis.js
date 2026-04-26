const respond = require('../../utils/respond');

module.exports = {
  name: 'serveremojis',
  aliases: ["emojilist"],
  category: 'server',
  description: "Lists server emojis.",
  usage: "serveremojis",
  examples: ["serveremojis"],

  async execute({ message, args }) {
    const emojis = message.guild.emojis.cache.map(e => `${e} \`:${e.name}:\``).slice(0, 40);
    return respond.reply(message, 'info', emojis.join(' ') || 'found no server emojis.');
  }
};
