const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findMember, canTarget, modlog } = require('../../utils/moderationSimple');

module.exports = {
  name: 'unmute',
  aliases: ['untimeout', 'ut'],
  category: 'moderation',
  description: 'Remove a member timeout.',
  usage: 'unmute <member> [reason]',
  examples: ['unmute @user appeal accepted'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `unmute <member> [reason]`.');

    const check = canTarget(message, member, 'moderate');
    if (!check.ok) return bad(message, check.reason);

    const reason = clean(args, 'Manual unmute');
    await member.timeout(null, reason);
    await modlog(message, 'unmute', member.id, reason);

    return ok(message, `Unmuted ${member.user.tag}. Reason: ${reason}`);
  }
};