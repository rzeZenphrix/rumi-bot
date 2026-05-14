const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findMember, canTarget, modlog } = require('../../utils/moderationSimple');

module.exports = {
  name: 'kick',
  aliases: ['k'],
  category: 'moderation',
  description: 'Kick a member.',
  usage: 'kick <member> [reason]',
  examples: ['kick @user spam'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.KickMembers],
  botPermissions: [PermissionFlagsBits.KickMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `kick <member> [reason]`.');

    const check = canTarget(message, member, 'kick');
    if (!check.ok) return bad(message, check.reason);

    const reason = clean(args, 'Manual kick');
    await member.kick(reason);
    await modlog(message, 'kick', member.id, reason);

    return ok(message, `Kicked ${member.user.tag}. Reason: ${reason}`);
  }
};
