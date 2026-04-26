const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { logModerationAction } = require('../../systems/logging/auditLog');

module.exports = {
  name: 'ban',
  aliases: ['b'],
  category: 'moderation',
  description: 'Ban a user.',
  usage: 'ban <@user|userId> [reason]',
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'Usage: `ban <@user|userId> [reason]`.');
    }

    const user = await resolveUser(client, target);

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user.');
    }

    const reason = args.join(' ') || 'Manual ban';

    await message.guild.members.ban(user.id, { reason });

    await logModerationAction({
      guildId: message.guild.id,
      userId: user.id,
      moderatorId: message.author.id,
      actionType: 'ban',
      reason
    });

    return respond.reply(message, 'good', `${user.tag} has been banned. Reason: ${reason}`);
  }
};
