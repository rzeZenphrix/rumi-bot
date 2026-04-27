const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveMember } = require('../../utils/resolveUser');
const { moderatabilityState } = require('../../utils/permissions');
const { parseDuration, humanDuration, MAX_TIMEOUT_MS } = require('../../utils/duration');
const { logModerationAction } = require('../../systems/logging/auditLog');

module.exports = {
  name: 'mute',
  aliases: ['timeout', 'to'],
  category: 'moderation',
  description: 'Timeout a member for up to 28 days.',
  usage: 'mute <@user|userId> <duration> [reason]',
  examples: [
    'mute @user 10m spam',
    'mute @user 2h repeated links',
    'timeout @user 1d raid behaviour'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const target = args.shift();
    const durationInput = args.shift();

    if (!target || !durationInput) {
      return respond.reply(message, 'info', 'I use it like this: `mute <@user|userId> <duration> [reason]`. Example: `mute @user 10m spam`.');
    }

    const member = await resolveMember(message.guild, target);

    if (!member) {
      return respond.reply(message, 'bad', 'I could not find that member.');
    }

    const moderateState = moderatabilityState(message.guild, member);
    if (!moderateState.ok) {
      return respond.reply(message, 'bad', `I couldn't timeout that member. ${moderateState.reason}`);
    }

    const durationMs = parseDuration(durationInput, {
      maxMs: MAX_TIMEOUT_MS,
      minMs: 1000
    });

    if (!durationMs) {
      return respond.reply(message, 'bad', 'That duration is invalid. Use something like `30s`, `10m`, `2h`, or `7d` up to 28 days.');
    }

    const reason = args.join(' ') || 'Manual mute';

    await member.timeout(durationMs, reason);

    await logModerationAction({
      guildId: message.guild.id,
      userId: member.id,
      moderatorId: message.author.id,
      actionType: 'mute',
      reason,
      metadata: {
        durationMs
      }
    });

    return respond.reply(message, 'good', `I muted ${member} for \`${humanDuration(durationMs)}\`. Reason: ${reason}`);
  }
};
