const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { createDashboardUrl } = require('../../systems/dashboard/session');

module.exports = {
  name: 'dashboard',
  aliases: ['dash', 'panel'],
  category: 'utility',
  description: 'I create a temporary authenticated dashboard link for this server.',
  usage: 'dashboard',
  examples: ['dashboard'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  typing: true,

  async execute({ message }) {
    const url = await createDashboardUrl(message.author.id, message.guild.id, ['dashboard', 'guild:manage']);
    return respond.reply(message, 'info', null, {
      title: 'Dashboard link',
      description: `I created a temporary dashboard link for **${message.guild.name}**.\n\n[Open dashboard](${url})`,
      footer: { text: 'This link expires automatically. Do not share it.' }
    });
  }
};
