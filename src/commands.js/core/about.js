const os = require('node:os');
const respond = require('../../utils/respond');
const pkg = require('../../../package.json');

module.exports = {
  name: 'about',
  aliases: [],
  category: 'core',
  description: 'I show information about Rumi.',
  usage: 'about',
  examples: ['about'],
  async execute({ client, message }) {
    return respond.reply(message, 'info', null, {
      description: `I am **Rumi**, a moderation, security, utility, and automation bot.\n\n**Version:** \`${pkg.version}\`\n**Node:** \`${process.version}\`\n**Discord.js:** \`${pkg.dependencies['discord.js']}\`\n**Platform:** \`${os.platform()} ${os.arch()}\`\n**Guilds:** \`${client.guilds.cache.size}\`\n**Commands loaded:** \`${client.commands.size}\``
    });
  }
};
