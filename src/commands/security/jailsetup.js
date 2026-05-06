const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { setupJail } = require('../../systems/jail/setupManager');

module.exports = {
  name: 'jailsetup',
  aliases: ['setupjail', 'quarantinesetup'],
  description: 'Create and harden the jail role and jail channel.',
  usage: 'jailsetup',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message }) {
    const result = await setupJail(message.guild, message.author.id);

    return respond.reply(
      message,
      'good',
      `I set up jail security. Role: ${result.jailRole}. Channel: ${result.jailChannel}. I denied the jail role in \`${result.deniedChannels}\` channels.`
    );
  }
};
