const { PermissionFlagsBits } = require('discord.js');
const { unjailMember } = require('../../systems/jail/jailManager');
const { clean, ok, bad, info, findMember, canTarget } = require('../../utils/moderationSimple');

module.exports = {
  name: 'unjail',
  aliases: ['release'],
  category: 'moderation',
  description: 'Release a member from quarantine.',
  usage: 'unjail <member> [reason]',
  examples: ['unjail @user appeal accepted'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `unjail <member> [reason]`.');

    const check = canTarget(message, member, 'moderate');
    if (!check.ok) return bad(message, check.reason);

    const reason = clean(args, 'Manual quarantine release');
    const result = await unjailMember({
      guild: message.guild,
      member,
      reason,
      actorId: message.author.id
    });

    if (!result.ok) return bad(message, `Could not unjail ${member.user.tag}: ${result.reason}.`);
    return ok(message, `Released ${member.user.tag}.`);
  }
};