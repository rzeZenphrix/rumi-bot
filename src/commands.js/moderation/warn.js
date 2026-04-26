const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { resolveMember } = require('../../utils/resolveUser');

module.exports = {
  name: 'warn',
  aliases: ['warnings', 'warns'],
  category: 'moderation',
  description: 'I add, list, delete, or clear Supabase-backed warnings.',
  usage: 'warn <add|list|delete|clear> ...',
  examples: ['warn add @user spamming', 'warn list @user', 'warn clear @user'],
  subcommands: [
    { name: 'add', description: 'Warn a member.', usage: 'add <member> <reason>' },
    { name: 'list', description: 'List warnings.', usage: 'list <member>' },
    { name: 'delete', description: 'Delete a warning by id.', usage: 'delete <warningId>' },
    { name: 'clear', description: 'Clear a member warnings.', usage: 'clear <member>' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'add').toLowerCase();

    if (sub === 'add') {
      const member = await resolveMember(message.guild, args.shift());
      const reason = args.join(' ').trim() || 'No reason provided.';
      if (!member) return respond.reply(message, 'bad', 'I could not find that member.');
      const row = await db.createWarning({ guild_id: message.guild.id, user_id: member.id, moderator_id: message.author.id, reason });
      return respond.reply(message, 'good', `I added warning \`${row.id}\` for ${member}.`);
    }

    if (sub === 'list') {
      const member = await resolveMember(message.guild, args.shift() || message.author.id);
      if (!member) return respond.reply(message, 'bad', 'I could not find that member.');
      const rows = await db.getWarnings(message.guild.id, member.id, 10);
      const lines = rows.map((row, index) => `${index + 1}. **${row.reason || 'No reason'}** — <t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:R>\n\`${row.id}\``);
      return respond.reply(message, 'info', lines.length ? `I found warnings for ${member}:\n${lines.join('\n')}` : `I found no warnings for ${member}.`);
    }

    if (sub === 'delete' || sub === 'remove') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `warn delete <warningId>`.');
      await db.deleteWarning(message.guild.id, id);
      return respond.reply(message, 'good', 'I deleted that warning.');
    }

    if (sub === 'clear') {
      const member = await resolveMember(message.guild, args.shift());
      if (!member) return respond.reply(message, 'bad', 'I could not find that member.');
      await db.clearWarnings(message.guild.id, member.id);
      return respond.reply(message, 'good', `I cleared warnings for ${member}.`);
    }

    return respond.reply(message, 'info', 'Use `warn add`, `warn list`, `warn delete`, or `warn clear`.');
  }
};
