const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { logModerationAction } = require('../../systems/logging/auditLog');
const { addHardban } = require('../../systems/security/hardbanStore');

module.exports = {
  name: 'hardban',
  aliases: [],
  category: 'security',
  description: 'Ban a user by ID/mention and add them to the hardban monitor so the ban is reapplied if removed.',
  usage: 'hardban <@user|userId> [deleteDays:0-7] [reason]',
  examples: [
    'hardban 123456789012345678 raid account',
    'hardban @user 1 scam links',
    'forceban 123456789012345678 7 mass spam'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'I use it like this: `hardban <@user|userId> [deleteDays:0-7] [reason]`.');
    }

    const user = await resolveUser(client, target);

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user. For hardban, a raw user ID usually works best.');
    }

    let deleteMessageSeconds = 0;
    let deleteDays = 0;

    if (/^\d+$/.test(args[0] || '')) {
      deleteDays = Math.max(0, Math.min(7, Number(args.shift())));
      deleteMessageSeconds = deleteDays * 24 * 60 * 60;
    }

    const reason = args.join(' ') || 'Security hardban';

    await message.guild.members.ban(user.id, {
      reason,
      deleteMessageSeconds
    });

    await addHardban(message.guild.id, user.id, {
      reason,
      moderatorId: message.author.id,
      deleteMessageSeconds
    });

    await logModerationAction({
      guildId: message.guild.id,
      userId: user.id,
      moderatorId: message.author.id,
      actionType: 'hardban',
      reason,
      metadata: {
        deleteDays,
        monitored: true
      }
    });

    return respond.reply(
      message,
      'good',
      `I hardbanned ${user} and added them to the hardban monitor. Deleted messages: \`${deleteDays}\` day(s). Reason: ${reason}`
    );
  }
};
