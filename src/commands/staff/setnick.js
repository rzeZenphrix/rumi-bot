const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findMember, canTarget } = require('../../utils/moderationSimple');

module.exports = {
  name: 'setnick',
  aliases: ['setnickname'],
  category: 'moderation',
  description: 'Set a member nickname.',
  usage: 'setnick <member> <nickname>',
  examples: ['setnick @user Bob'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    const nick = clean(args, '');
    if (!member || !nick) return info(message, 'Usage: `setnick <member> <nickname>`.');

    const check = canTarget(message, member, 'manage');
    if (!check.ok) return bad(message, check.reason);

    await member.setNickname(nick.slice(0, 32), `Nickname set by ${message.author.tag}`);
    return ok(message, `Changed ${member.user.tag}'s nickname.`);
  }
};