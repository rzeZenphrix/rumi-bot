const respond = require('../../utils/respond');

module.exports = {
  name: 'guildicon',
  aliases: ['gi'],
  category: 'info',
  description: 'Show the server icon.',
  usage: 'guildicon',
  guildOnly: true,

  async execute({ message }) {
    const url = message.guild.iconURL({ size: 4096, extension: 'png', forceStatic: false });
    if (!url) return respond.reply(message, 'bad', 'This server does not have an icon.');
    return respond.reply(message, 'info', null, {
      title: `${message.guild.name} icon`,
      description: `[Open icon](${url})`,
      image: url
    });
  }
};
