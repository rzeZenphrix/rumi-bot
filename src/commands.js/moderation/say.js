const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'say',
  aliases: ['speak'],
  category: 'moderation',
  description: 'Makes me send a plain message.',
  usage: 'say <message>',
  permissions: [PermissionFlagsBits.ManageMessages],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need a message to say.');
    await message.delete().catch(() => null);
    return message.channel.send({ content: text, allowedMentions: { parse: [] } });
  }
};
