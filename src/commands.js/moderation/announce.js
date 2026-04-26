const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'announce',
  aliases: ['announcement'],
  category: 'moderation',
  description: 'Sends a clean announcement embed.',
  usage: 'announce <message>',
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const text = args.join(' ').trim();
    if (!text) return respond.reply(message, 'info', 'need announcement text.');
    return respond.reply(message, 'list', null, { description: text, allowedMentions: { parse: [] } });
  }
};
