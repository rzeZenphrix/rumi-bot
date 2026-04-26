const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'clearnick',
  aliases: ['resetnick'],
  category: 'moderation',
  description: 'Clears a member nickname.',
  usage: 'clearnick @user',
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message }) {
    const member = message.mentions.members.first();
    if (!member) return respond.reply(message, 'info', 'need a member mention.');
    await member.setNickname(null, `Cleared by ${message.author.tag}`);
    return respond.reply(message, 'good', `cleared ${member}'s nickname.`);
  }
};
