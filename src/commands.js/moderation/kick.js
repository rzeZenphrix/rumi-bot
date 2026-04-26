const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveMember } = require('../../utils/resolveUser');
const { logModerationAction } = require('../../systems/logging/auditLog');

module.exports = {
  name: 'kick',
  aliases: ['k'],
  category: 'moderation',
  description: 'Kick a member.',
  usage: 'kick <@user|userId> [reason]',
  guildOnly: true,
  permissions: [PermissionFlagsBits.KickMembers],
  botPermissions: [PermissionFlagsBits.KickMembers],

  async execute({ message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'Usage: `kick <@user|userId> [reason]`.');
    }

    const member = await resolveMember(message.guild, target);

    if (!member) {
      return respond.reply(message, 'bad', 'I could not find that member.');
    }

    const reason = args.join(' ') || 'Manual kick';

    await member.kick(reason);

    await logModerationAction({
      guildId: message.guild.id,
      userId: member.id,
      moderatorId: message.author.id,
      actionType: 'kick',
      reason
    });

    return respond.reply(message, 'good', `${member.user.tag} has been kicked. Reason: ${reason}`);
  }
};
