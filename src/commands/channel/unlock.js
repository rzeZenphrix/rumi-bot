const { PermissionFlagsBits } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const {
  TEXT_UNLOCK_PERMISSIONS,
  resolveChannelRoleTarget,
  missingChannelManagePermission
} = require('../../systems/moderation/channelLockManager');
const { clean, ok, bad } = require('../../utils/moderationSimple');
const respond = require('../../utils/respond');

module.exports = {
  name: 'unlock',
  aliases: ['channelunlock', 'unlockchannel'],
  category: 'moderation',
  description: 'Unlock a channel.',
  usage: 'unlock [channel] [role] [reason]',
  examples: ['unlock', 'unlock #general restored'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 3,

  async execute({ message, args }) {
    const { channel, role, remaining } = await resolveChannelRoleTarget(message, args);
    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!channel?.permissionOverwrites?.edit) return bad(message, 'That channel cannot be unlocked.');
    if (missingChannelManagePermission(me, channel)) return bad(message, `I cannot manage **${channel.name}**.`);

    const reason = clean(remaining, `Unlocked by ${message.author.tag}`);
    await channel.permissionOverwrites.edit(role, TEXT_UNLOCK_PERMISSIONS, { reason });

    await sendLog(message.guild, 'moderationAction', {
      title: 'Channel unlocked',
      actorId: message.author.id,
      channelId: channel.id,
      description: `${message.author} unlocked ${channel} for ${role}.`,
      fields: [{ name: 'Reason', value: reason }]
    }).catch(() => null);

    return respond.reply(message, 'unlock', `Unlocked **${channel.name}**.`);
  }
};