const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const { clean, ok, bad, info, findMember } = require('../../utils/moderationSimple');
const { friendlyId, matchesFriendlyId } = require('../../utils/friendlyIds');

async function resolveWarningId(guildId, input) {
  const { data } = await db.supabase
    .from('warnings')
    .select('id')
    .eq('guild_id', guildId)
    .limit(500);
  return (data || []).find((row) => matchesFriendlyId(row.id, input, 'warn'))?.id || input;
}

module.exports = {
  name: 'warn',
  aliases: ['warnings', 'warns'],
  category: 'moderation',
  description: 'Warn, list, delete, or clear warnings.',
  usage: 'warn <member|clear|delete> [reason]',
  examples: ['warn @user spam', 'warn @user', 'warn clear @user', 'warn delete warningId'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],
  typing: true,

  async execute({ message, args }) {
    const first = (args.shift() || '').toLowerCase();

    if (['delete', 'del', 'remove'].includes(first)) {
      const warningId = args.shift();
      if (!warningId) return info(message, 'Usage: `warn delete <warningId>`.');
      await db.deleteWarning(message.guild.id, await resolveWarningId(message.guild.id, warningId));
      return ok(message, 'Deleted that warning.');
    }

    if (first === 'clear') {
      const member = await findMember(message.guild, args.shift());
      if (!member) return info(message, 'Usage: `warn clear <member>`.');
      await db.clearWarnings(message.guild.id, member.id);
      return ok(message, `Cleared warnings for ${member.user.tag}.`);
    }

    const member = await findMember(message.guild, first);
    if (!member) return info(message, 'Usage: `warn <member> [reason]`.');

    if (!args.length) {
      const rows = await db.getWarnings(message.guild.id, member.id, 10);
      const lines = rows.map((row, i) => `${i + 1}. ${row.reason} - ${friendlyId(row.id, 'warn')}`);
      return info(message, lines.length ? lines.join('\n') : `${member.user.tag} has no warnings.`);
    }

    const reason = clean(args, 'No reason provided.');
    const row = await db.createWarning({
      guild_id: message.guild.id,
      user_id: member.id,
      moderator_id: message.author.id,
      reason
    });

    return ok(message, `Warned ${member.user.tag}. ID: ${friendlyId(row.id, 'warn')}`);
  }
};
