const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'setnick',
  aliases: ['setnickname'],
  category: 'moderation',
  description: 'Sets a member nickname.',
  usage: 'setnick @user <nickname>',
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message, args }) {
    const member = message.mentions.members.first();
    if (!member) return respond.reply(message, 'info', 'need a member mention.');
    const nick = args.slice(1).join(' ').trim();
    if (!nick) return respond.reply(message, 'info', 'need a nickname.');
    await member.setNickname(nick, `Changed by ${message.author.tag}`);
    return respond.reply(message, 'good', `changed ${member}'s nickname.`);
  }
};
