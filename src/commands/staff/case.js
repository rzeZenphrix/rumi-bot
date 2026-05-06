const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const { clean, ok, bad, info, findUser, id } = require('../../utils/moderationSimple');

async function q(query, label) {
  const { data } = await db.runQuery(query, label);
  return data;
}

async function getCase(guildId, caseId) {
  return q(
    db.supabase.from('mod_cases').select('*').eq('guild_id', guildId).eq('id', caseId).maybeSingle(),
    'getModCase'
  );
}

module.exports = {
  name: 'case',
  aliases: ['cases', 'modcase'],
  category: 'moderation',
  description: 'Create, view, note, close, delete, or list moderation cases.',
  usage: 'case [user reason|caseId|list|note|close|delete]',
  examples: ['case @user repeated spam', 'case 12', 'case note 12 appealed', 'case close 12 resolved'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  typing: true,

  async execute({ client, message, args }) {
    const first = (args.shift() || '').toLowerCase();

    if (!first || first === 'list') {
      const target = await findUser(client, args[0]).catch(() => null);
      let query = db.supabase.from('mod_cases').select('*').eq('guild_id', message.guild.id);
      if (target) query = query.eq('user_id', target.id);
      const rows = await q(query.order('created_at', { ascending: false }).limit(10), 'listModCases');

      const lines = rows.map((row) =>
        `#${row.id} ${row.status} <@${row.user_id}> — ${row.reason}`
      );

      return info(message, lines.length ? lines.join('\n') : 'No cases found.');
    }

    if (/^\d+$/.test(first)) {
      const row = await getCase(message.guild.id, first);
      if (!row) return bad(message, 'Case not found.');

      const notes = await q(
        db.supabase.from('mod_case_notes').select('*').eq('guild_id', message.guild.id).eq('case_id', row.id).order('created_at'),
        'listModCaseNotes'
      );

      const noteLines = notes.map((n) => `- ${n.note} — <@${n.moderator_id}>`).join('\n') || 'No notes.';
      return info(message, `Case #${row.id}\nUser: <@${row.user_id}>\nModerator: <@${row.moderator_id}>\nStatus: ${row.status}\nReason: ${row.reason}\nNotes:\n${noteLines}`);
    }

    if (first === 'note') {
      const caseId = args.shift();
      const note = clean(args, '');
      if (!caseId || !note) return info(message, 'Usage: `case note <caseId> <note>`.');

      const row = await getCase(message.guild.id, caseId);
      if (!row) return bad(message, 'Case not found.');

      await q(db.supabase.from('mod_case_notes').insert({
        case_id: row.id,
        guild_id: message.guild.id,
        moderator_id: message.author.id,
        note
      }), 'createModCaseNote');

      return ok(message, `Added note to case #${row.id}.`);
    }

    if (first === 'close' || first === 'archive') {
      const caseId = args.shift();
      const row = await getCase(message.guild.id, caseId);
      if (!row) return bad(message, 'Case not found.');

      await q(
        db.supabase.from('mod_cases').update({
          status: first === 'archive' ? 'archived' : 'closed',
          closed_by: message.author.id,
          closed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq('guild_id', message.guild.id).eq('id', row.id),
        'closeModCase'
      );

      return ok(message, `Set case #${row.id} to ${first === 'archive' ? 'archived' : 'closed'}.`);
    }

    if (['delete', 'del', 'remove'].includes(first)) {
      const caseId = args.shift();
      if (!caseId) return info(message, 'Usage: `case delete <caseId>`.');

      await q(db.supabase.from('mod_cases').delete().eq('guild_id', message.guild.id).eq('id', caseId), 'deleteModCase');
      return ok(message, `Deleted case #${caseId}.`);
    }

    const user = await findUser(client, first);
    if (!user) return info(message, 'Usage: `case @user <reason>` or `case <caseId>`.');

    const reason = clean(args, 'No reason provided.');
    const row = await q(
      db.supabase.from('mod_cases').insert({
        guild_id: message.guild.id,
        user_id: user.id,
        moderator_id: message.author.id,
        action_type: 'manual',
        reason,
        status: 'open'
      }).select().single(),
      'createModCase'
    );

    return ok(message, `Created case #${row.id} for ${user.tag}.`);
  }
};