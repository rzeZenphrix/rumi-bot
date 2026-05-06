const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { lockdownGuild } = require('../../systems/security/lockdownManager');

module.exports = {
  name: 'lockdown',
  aliases: ['serverlockdown', 'raidlock'],
  category: 'security',
  description: 'Lock all text-based channels by denying send/thread permissions for @everyone.',
  usage: 'lockdown [reason]',
  examples: [
    'lockdown raid detected',
    'lockdown mass spam links',
    'lock raid'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const reason = args.join(' ') || 'Manual security lockdown';

    const result = await lockdownGuild({
      guild: message.guild,
      actorId: message.author.id,
      reason
    });

    if (!result.ok) {
      return respond.reply(message, 'bad', result.reason || 'I could not lockdown this server.');
    }

    return respond.reply(message, result.channelCount > 0 ? 'good' : 'alert', `I locked \`${result.channelCount}\` channel(s). Failed: \`${result.failedCount}\`. Reason: ${reason}`);
  }
};
