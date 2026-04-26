const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveMember } = require('../../utils/resolveUser');
const { canModerateMember } = require('../../utils/permissions');
const { logModerationAction } = require('../../systems/logging/auditLog');

module.exports = {
  name: 'unmute',
  aliases: ['untimeout', 'ut'],
  category: 'moderation',
  description: 'Remove a member timeout.',
  usage: 'unmute <@user|userId> [reason]',
  examples: [
    'unmute @user appeal accepted',
    'untimeout @user'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'I use it like this: `unmute <@user|userId> [reason]`.');
    }

    const member = await resolveMember(message.guild, target);

    if (!member) {
      return respond.reply(message, 'bad', 'I could not find that member.');
    }

    if (!canModerateMember(message.guild, member)) {
      return respond.reply(message, 'bad', 'I cannot remove timeout from that member. Check my role position and permissions.');
    }

    const reason = args.join(' ') || 'Manual unmute';

    await member.timeout(null, reason);

    await logModerationAction({
      guildId: message.guild.id,
      userId: member.id,
      moderatorId: message.author.id,
      actionType: 'unmute',
      reason
    });

    return respond.reply(message, 'good', `I removed timeout from ${member}. Reason: ${reason}`);
  }
};