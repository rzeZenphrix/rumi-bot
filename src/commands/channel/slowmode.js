const { PermissionFlagsBits } = require('discord.js');
const { ok, info } = require('../../utils/moderationSimple');

module.exports = {
  name: 'slowmode',
  aliases: ['slow'],
  category: 'moderation',
  description: 'Set channel slowmode.',
  usage: 'slowmode <seconds|off>',
  examples: ['slowmode 5', 'slowmode off'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const raw = (args.shift() || '').toLowerCase();
    const seconds = raw === 'off' ? 0 : Number(raw);

    if (!Number.isFinite(seconds) || seconds < 0 || seconds > 21600) {
      return info(message, 'Usage: `slowmode <seconds|off>`.');
    }

    await message.channel.setRateLimitPerUser(seconds, `Slowmode by ${message.author.tag}`);
    return ok(message, seconds ? `Slowmode set to ${seconds}s.` : 'Slowmode off.');
  }
};