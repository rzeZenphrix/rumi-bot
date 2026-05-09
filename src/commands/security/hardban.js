const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { logModerationAction } = require('../../systems/logging/auditLog');
const { addHardban } = require('../../systems/security/hardbanStore');

const GOOD_EMOJI = process.env.GOOD_EMOJI || process.env.RUMI_GOOD_EMOJI || '✅';

async function reactGood(message) {
  return message.react(GOOD_EMOJI).catch(() => message.react('✅').catch(() => null));
}

module.exports = {
  name: 'hardban',
  aliases: ['forceban'],
  category: 'security',
  description: 'Ban a user and add them to the hardban monitor.',
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
      return respond.reply(message, 'info', 'Usage: `hardban <@user|userId> [deleteDays:0-7] [reason]`.');
    }

    const user = await resolveUser(client, target);

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user. Use a raw user ID if they are not cached.');
    }

    let deleteDays = 0;

    if (/^\d+$/.test(args[0] || '')) {
      deleteDays = Math.max(0, Math.min(7, Number(args.shift())));
    }

    const deleteMessageSeconds = deleteDays * 24 * 60 * 60;
    const reason = args.join(' ').trim() || 'Security hardban';

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

    return reactGood(message);
  }
};