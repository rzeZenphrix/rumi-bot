const { PermissionFlagsBits } = require('discord.js');
const { ok } = require('../../utils/moderationSimple');

module.exports = {
  name: 'hide',
  aliases: ['hidechannel'],
  category: 'moderation',
  description: 'Hide this channel from everyone.',
  usage: 'hide',
  examples: ['hide'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message }) {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      { ViewChannel: false },
      { reason: `Hidden by ${message.author.tag}` }
    );

    return ok(message, 'Hidden from everyone.');
  }
};