const { PermissionFlagsBits } = require('discord.js');
const { jailMember } = require('../../systems/jail/jailManager');
const { clean, ok, bad, info, findMember, canTarget } = require('../../utils/moderationSimple');

module.exports = {
  name: 'jail',
  aliases: ['quarantine'],
  category: 'moderation',
  description: 'Quarantine a member.',
  usage: 'jail <member> [reason]',
  examples: ['jail @user raid behaviour'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `jail <member> [reason]`.');

    const check = canTarget(message, member, 'moderate');
    if (!check.ok) return bad(message, check.reason);

    const reason = clean(args, 'Manual quarantine');
    const result = await jailMember({
      guild: message.guild,
      member,
      reason,
      actorId: message.author.id,
      metadata: { command: 'jail' }
    });

    if (!result.ok) return bad(message, `Could not jail ${member.user.tag}: ${result.reason}.`);
    return ok(message, `Jailed ${member.user.tag}. Reason: ${reason}`);
  }
};