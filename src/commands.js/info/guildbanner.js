const respond = require('../../utils/respond');

module.exports = {
  name: 'guildbanner',
  aliases: ['gbanner', 'serverguildbanner'],
  category: 'info',
  description: 'Show this server banner.',
  usage: 'guildbanner',
  examples: ['guildbanner'],
  guildOnly: true,

  async execute({ message }) {
    const guild = await message.guild.fetch();

    const url = guild.bannerURL({
      size: 4096,
      extension: 'png',
      forceStatic: false
    });

    if (!url) return respond.reply(message, 'bad', 'This server does not have a banner.');

    return respond.reply(message, 'info', null, {
      title: `${guild.name} banner`,
      description: `[Open banner](${url})`,
      image: url
    });
  }
};