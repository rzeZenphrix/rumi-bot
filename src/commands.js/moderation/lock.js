const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { sendLog } = require('../../systems/logging/logDispatcher');
const {
  TEXT_LOCK_PERMISSIONS,
  resolveChannelRoleTarget,
  missingChannelManagePermission
} = require('../../systems/moderation/channelLockManager');

module.exports = {
  name: 'lock',
  aliases: ['channellock', 'lockchannel'],
  category: 'moderation',
  description: 'Lock a channel for @everyone or a specific role.',
  usage: 'lock [channel] [role] [reason]',
  examples: ['lock', 'lock #general cleanup', 'lock general @Member noisy spam'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  cooldown: 3,

  async execute({ message, args }) {
    const { channel, role, remaining } = await resolveChannelRoleTarget(message, args);
    const reason = remaining.join(' ').trim() || `Channel lock by ${message.author.tag}`;
    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);

    if (!channel?.permissionOverwrites?.edit) {
      return respond.reply(message, 'bad', 'I could not lock that channel because it does not support permission overwrites.');
    }

    if (missingChannelManagePermission(me, channel)) {
      return respond.reply(message, 'bad', `I could not lock ${channel} because I am missing Manage Channels there.`);
    }

    try {
      await channel.permissionOverwrites.edit(role, TEXT_LOCK_PERMISSIONS, { reason });
    } catch (_error) {
      return respond.reply(message, 'bad', `I could not lock ${channel}. Check my channel permissions and role position.`);
    }

    await sendLog(message.guild, 'moderationAction', {
      title: 'Channel locked',
      actorId: message.author.id,
      channelId: channel.id,
      description: `${message.author} locked ${channel} for ${role}.`,
      fields: [{ name: 'Reason', value: reason, inline: false }]
    }).catch(() => null);

    return respond.reply(message, 'good', `I locked ${channel} for ${role}. Reason: ${reason}`);
  }
};
