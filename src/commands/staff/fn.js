const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findMember, canTarget } = require('../../utils/moderationSimple');

module.exports = {
  name: 'fn',
  aliases: ['forcenick', 'force-nick', 'nick', 'nickname'],
  category: 'moderation',
  description: 'Change or reset a member nickname.',
  usage: 'fn <member> <nickname|reset>',
  examples: ['fn @user Bob', 'fn @user reset'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `fn <member> <nickname|reset>`.');

    const check = canTarget(message, member, 'manage');
    if (!check.ok) return bad(message, check.reason);

    const raw = clean(args, 'reset');
    const nickname = /^(reset|null|none|clear|remove)$/i.test(raw) ? null : raw.slice(0, 32);

    await member.setNickname(nickname, `Nickname changed by ${message.author.tag}`);
    return ok(message, nickname ? `Changed ${member.user.tag}'s nickname to ${nickname}.` : `Reset ${member.user.tag}'s nickname.`);
  }
};