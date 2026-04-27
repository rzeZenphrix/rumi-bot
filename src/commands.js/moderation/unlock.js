const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { sendLog } = require('../../systems/logging/logDispatcher');
const {
  TEXT_UNLOCK_PERMISSIONS,
  resolveChannelRoleTarget,
  missingChannelManagePermission
} = require('../../systems/moderation/channelLockManager');

module.exports = {
  name: 'unlock',
  aliases: ['channelunlock', 'unlockchannel'],
  category: 'moderation',
  description: 'Unlock a channel for @everyone or a specific role.',
  usage: 'unlock [channel] [role] [reason]',
  examples: ['unlock', 'unlock #general all clear', 'unlock general @Member restored chat'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 3,

  async execute({ message, args }) {
    const { channel, role, remaining } = await resolveChannelRoleTarget(message, args);
    const reason = remaining.join(' ').trim() || `Channel unlock by ${message.author.tag}`;
    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    if (!channel?.permissionOverwrites?.edit) {
      return respond.reply(message, 'bad', 'I could not unlock that channel because it does not support permission overwrites.');
    }

    if (missingChannelManagePermission(me, channel)) {
      return respond.reply(message, 'bad', `I could not unlock ${channel} because I am missing Manage Channels there.`);
    }

    try {
      await channel.permissionOverwrites.edit(role, TEXT_UNLOCK_PERMISSIONS, { reason });
    } catch (_error) {
      return respond.reply(message, 'bad', `I could not unlock ${channel}. Check my channel permissions and role position.`);
    }

    await sendLog(message.guild, 'moderationAction', {
      title: 'Channel unlocked',
      actorId: message.author.id,
      channelId: channel.id,
      description: `${message.author} unlocked ${channel} for ${role}.`,
      fields: [{ name: 'Reason', value: reason, inline: false }]
    }).catch(() => null);

    return respond.reply(message, 'good', `I unlocked ${channel} for ${role}. Reason: ${reason}`);
  }
};
