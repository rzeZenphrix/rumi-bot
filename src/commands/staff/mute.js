const { PermissionFlagsBits } = require('discord.js');
const { parseDuration, humanDuration, MAX_TIMEOUT_MS } = require('../../utils/duration');
const { clean, ok, bad, info, findMember, canTarget, modlog } = require('../../utils/moderationSimple');

module.exports = {
  name: 'mute',
  aliases: ['timeout', 'to'],
  category: 'moderation',
  description: 'Timeout a member.',
  usage: 'mute <member> <duration> [reason]',
  examples: ['mute @user 10m spam', 'mute @user 2h links'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    const ms = parseDuration(args.shift(), { maxMs: MAX_TIMEOUT_MS, minMs: 1000 });

    if (!member || !ms) return info(message, 'Usage: `mute <member> <duration> [reason]`.');

    const check = canTarget(message, member, 'moderate');
    if (!check.ok) return bad(message, check.reason);

    const reason = clean(args, 'Manual mute');
    await member.timeout(ms, reason);
    await modlog(message, 'mute', member.id, reason, { durationMs: ms });

    return ok(message, `Muted ${member.user.tag} for ${humanDuration(ms)}. Reason: ${reason}`);
  }
};