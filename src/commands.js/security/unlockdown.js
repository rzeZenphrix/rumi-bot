const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { unlockdownGuild } = require('../../systems/security/lockdownManager');

module.exports = {
  name: 'unlockdown',
  aliases: ['unlock'],
  category: 'security',
  description: 'Restore channel permissions from the latest lockdown snapshot.',
  usage: 'unlockdown [reason]',
  examples: [
    'unlockdown raid ended',
    'unlock safe now'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const reason = args.join(' ') || 'Manual security unlockdown';

    const result = await unlockdownGuild({
      guild: message.guild,
      actorId: message.author.id,
      reason
    });

    if (!result.ok) {
      return respond.reply(message, 'bad', result.reason || 'I could not unlock this server.');
    }

    return respond.reply(
      message,
      result.fullyRestored ? 'good' : 'alert',
      `I restored \`${result.restoredCount}\` channel(s). Failed: \`${result.failedCount}\`. Reason: ${reason}`
    );
  }
};