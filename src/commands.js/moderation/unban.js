const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { logModerationAction } = require('../../systems/logging/auditLog');
const { getHardban, removeHardban } = require('../../systems/security/hardbanStore');

module.exports = {
  name: 'unban',
  aliases: ['rb', 'pardon'],
  category: 'moderation',
  description: 'Unban a user by mention or ID. Hardbanned users require --force-hardban to remove the monitor first.',
  usage: 'unban <@user|userId> [--force-hardban] [reason]',
  examples: [
    'unban 123456789012345678 appeal accepted',
    'pardon @user mistake',
    'unban 123456789012345678 --force-hardban appeal accepted'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const target = args.shift();

    if (!target) {
      return respond.reply(message, 'info', 'I use it like this: `unban <@user|userId> [--force-hardban] [reason]`.');
    }

    const user = await resolveUser(client, target);

    if (!user) {
      return respond.reply(message, 'bad', 'I could not find that user. Use their raw user ID if they are not cached.');
    }

    const forceHardbanRemoval = args.includes('--force-hardban') || args.includes('--force');
    const filteredArgs = args.filter((arg) => !['--force-hardban', '--force'].includes(arg));
    const hardban = await getHardban(message.guild.id, user.id);

    if (hardban && !forceHardbanRemoval) {
      return respond.reply(
        message,
        'alert',
        `That user is hardbanned. Use \`unban ${user.id} --force-hardban [reason]\` only if you intentionally want to remove the hardban monitor.`
      );
    }

    const reason = filteredArgs.join(' ') || 'Manual unban';

    if (hardban && forceHardbanRemoval) {
      await removeHardban(message.guild.id, user.id);
    }

    await message.guild.members.unban(user.id, reason);

    await logModerationAction({
      guildId: message.guild.id,
      userId: user.id,
      moderatorId: message.author.id,
      actionType: hardban && forceHardbanRemoval ? 'hardunban' : 'unban',
      reason,
      metadata: {
        removedHardbanMonitor: Boolean(hardban && forceHardbanRemoval)
      }
    });

    return respond.reply(
      message,
      'good',
      `I unbanned ${user}${hardban && forceHardbanRemoval ? ' and removed the hardban monitor' : ''}. Reason: ${reason}`
    );
  }
};
