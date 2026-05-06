const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const { parseDuration, humanDuration } = require('../../utils/duration');
const { clean, ok, info, findUser, modlog } = require('../../utils/moderationSimple');

async function q(query, label) {
  const { data } = await db.runQuery(query, label);
  return data;
}

module.exports = {
  name: 'tempban',
  aliases: ['tb'],
  category: 'moderation',
  description: 'Temporarily ban a user.',
  usage: 'tempban <user> <duration> [reason]',
  examples: ['tempban @user 1d raid'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const user = await findUser(client, args.shift());
    const ms = parseDuration(args.shift());
    if (!user || !ms) return info(message, 'Usage: `tempban <user> <duration> [reason]`.');

    const reason = clean(args, `Tempban by ${message.author.tag}`);
    const unbanAt = new Date(Date.now() + ms).toISOString();

    await message.guild.members.ban(user.id, { deleteMessageSeconds: 0, reason });

    const task = await db.createScheduledTask({
      guild_id: message.guild.id,
      user_id: user.id,
      task_type: 'tempban_unban',
      run_at: unbanAt,
      payload: { reason }
    }).catch(() => null);

    await q(
      db.supabase.from('temp_bans').upsert({
        guild_id: message.guild.id,
        user_id: user.id,
        moderator_id: message.author.id,
        reason,
        unban_at: unbanAt,
        active: true,
        task_id: task?.id || null
      }, { onConflict: 'guild_id,user_id' }),
      'upsertTempBan'
    );

    await modlog(message, 'tempban', user.id, reason, { durationMs: ms, unbanAt });

    return ok(message, `Tempbanned ${user.tag} for ${humanDuration(ms)}.`);
  }
};