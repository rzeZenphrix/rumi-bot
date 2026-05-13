const { PermissionFlagsBits } = require('discord.js');
const { ok } = require('../../utils/moderationSimple');
const respond = require('../../utils/respond');

module.exports = {
  name: 'unhide',
  aliases: ['showchannel', 'show'],
  category: 'moderation',
  description: 'Restore everyone channel visibility.',
  usage: 'unhide',
  examples: ['unhide'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message }) {
    await message.channel.permissionOverwrites.edit(
      message.guild.roles.everyone,
      { ViewChannel: null },
      { reason: `Unhidden by ${message.author.tag}` }
    );

    return respond.reply(message, 'up', 'Visibility restored.');
  }
};