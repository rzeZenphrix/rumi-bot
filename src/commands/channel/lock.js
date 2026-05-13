const { PermissionFlagsBits } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const {
  TEXT_LOCK_PERMISSIONS,
  resolveChannelRoleTarget,
  missingChannelManagePermission
} = require('../../systems/moderation/channelLockManager');
const { clean, ok, bad } = require('../../utils/moderationSimple');
const respond = require('../../utils/respond');

module.exports = {
  name: 'lock',
  aliases: ['channellock', 'lockchannel'],
  category: 'moderation',
  description: 'Lock a channel.',
  usage: 'lock [channel] [role] [reason]',
  examples: ['lock', 'lock #general cleanup'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 3,

  async execute({ message, args }) {
    const { channel, role, remaining } = await resolveChannelRoleTarget(message, args);
    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!channel?.permissionOverwrites?.edit) return bad(message, 'That channel cannot be locked.');
    if (missingChannelManagePermission(me, channel)) return bad(message, `I cannot manage ${channel.name}.`);

    const reason = clean(remaining, `Locked by ${message.author.tag}`);
    await channel.permissionOverwrites.edit(role, TEXT_LOCK_PERMISSIONS, { reason });

    await sendLog(message.guild, 'moderationAction', {
      title: 'Channel locked',
      actorId: message.author.id,
      channelId: channel.id,
      description: `${message.author} locked ${channel} for ${role}.`,
      fields: [{ name: 'Reason', value: reason }]
    }).catch(() => null);

    return respond.reply(message, 'lock', `Locked **${channel.name}**.`);
  }
};