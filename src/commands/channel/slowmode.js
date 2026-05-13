const { PermissionFlagsBits } = require('discord.js');
const { ok, info } = require('../../utils/moderationSimple');
const respond = require('../../utils/respond');

module.exports = {
  name: 'slowmode',
  aliases: ['slow'],
  category: 'moderation',
  description: 'Set channel slowmode.',
  usage: 'slowmode <seconds|off>',
  examples: ['slowmode 5', 'slowmode 0'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const raw = (args.shift() || '').toLowerCase();
    const seconds = raw === 'off' ? 0 : Number(raw);

    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 21600) {
      return info(message, '> Set slowmode for a channel.\n\n`slowmode <seconds|off>\nExample\nslowmode 5```\n-# Tip\nSet seconds to 0 to turn **off** slowmode.');
    }

    await message.channel.setRateLimitPerUser(seconds, `Slowmode by ${message.author.tag}`);
    return respond.reply(message, 'time', seconds ? `Slowmode set to **${seconds}s**.` : 'Slowmode **off**.');
  }
};