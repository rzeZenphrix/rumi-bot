const { PermissionFlagsBits } = require('discord.js');
const { info } = require('../../utils/moderationSimple');

module.exports = {
  name: 'say',
  aliases: ['speak'],
  category: 'moderation',
  description: 'Send a plain message.',
  usage: 'say <message>',
  examples: ['say Hello everyone'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return info(message, 'Usage: `say <message>`.');

    await message.delete().catch(() => null);
    return message.channel.send({ content: text, allowedMentions: { parse: [] } });
  }
};