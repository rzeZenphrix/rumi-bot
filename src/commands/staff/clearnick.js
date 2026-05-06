const { PermissionFlagsBits } = require('discord.js');
const { ok, bad, info, findMember, canTarget } = require('../../utils/moderationSimple');

module.exports = {
  name: 'clearnick',
  aliases: ['resetnick'],
  category: 'moderation',
  description: 'Reset a member nickname.',
  usage: 'clearnick <member>',
  examples: ['clearnick @user'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageNicknames],
  botPermissions: [PermissionFlagsBits.ManageNicknames],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `clearnick <member>`.');

    const check = canTarget(message, member, 'manage');
    if (!check.ok) return bad(message, check.reason);

    await member.setNickname(null, `Nickname reset by ${message.author.tag}`);
    return ok(message, `Reset ${member.user.tag}'s nickname.`);
  }
};