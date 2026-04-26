const respond = require('../../utils/respond');

module.exports = {
  name: 'serverstickers',
  aliases: ["stickerlist"],
  category: 'server',
  description: "Lists server stickers.",
  usage: "serverstickers",
  examples: ["serverstickers"],

  async execute({ message, args }) {
    const stickers = message.guild.stickers.cache.map(s => `${s.name} (\`${s.id}\`)`).slice(0, 30);
    return respond.reply(message, 'info', stickers.join('\n') || 'found no server stickers.');
  }
};
