const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { extractId } = require('../../utils/resolveUser');

function parseSubject(input) {
  const raw = String(input || '');
  const role = raw.match(/^<@&(\d{17,20})>$/)?.[1];
  const user = raw.match(/^<@!?(\d{17,20})>$/)?.[1];
  const id = role || user || extractId(raw);

  if (!id) return null;

  return {
    subject_type: role ? 'role' : 'user',
    subject_id: id
  };
}

function permissionFromName(input) {
  const raw = String(input || '').replace(/[^a-z0-9]/gi, '').toLowerCase();

  const match = Object.entries(PermissionFlagsBits).find(([name]) => {
    return name.toLowerCase() === raw;
  });

  return match ? match[1].toString() : input;
}

module.exports = {
  name: 'fakeperm',
  aliases: ['fp', 'fakeperms', 'fakepermission'],
  category: 'config',
  description: 'I manage fake permissions stored in Supabase for command access.',
  usage: 'fakeperm <grant|revoke|list> ...',
  examples: ['fakeperm grant @role ManageMessages', 'fakeperm revoke @user BanMembers', 'fakeperm list'],
  subcommands: [
    { name: 'grant', description: 'Grant a fake permission to a user or role.', usage: 'grant <@user|@role> <permission>' },
    { name: 'revoke', description: 'Remove a fake permission.', usage: 'revoke <@user|@role> <permission>' },
    { name: 'list', description: 'List fake permissions for this server.', usage: 'list' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'list') {
      const rows = await db.listFakePermissions(message.guild.id);
      const lines = rows.slice(0, 25).map((row) => {
        const target = row.subject_type === 'role' ? `<@&${row.subject_id}>` : `<@${row.subject_id}>`;
        return `${target} — \`${row.permission}\``;
      });

      return respond.reply(message, 'info', lines.length ? `I found these fake permissions:\n${lines.join('\n')}` : 'I have no fake permissions saved for this server.');
    }

    if (!['grant', 'revoke'].includes(sub)) {
      return respond.reply(message, 'info', 'Use `fakeperm grant`, `fakeperm revoke`, or `fakeperm list`.');
    }

    const subject = parseSubject(args.shift());
    const permission = permissionFromName(args.shift());

    if (!subject || !permission) {
      return respond.reply(message, 'info', `Use \`fakeperm ${sub} <@user|@role> <permission>\`.`);
    }

    if (sub === 'grant') {
      await db.upsertFakePermission({
        guild_id: message.guild.id,
        ...subject,
        permission: permission.toString(),
        enabled: true,
        granted_by: message.author.id
      });

      return respond.reply(message, 'good', `I granted fake permission \`${permission}\`.`);
    }

    await db.removeFakePermission(message.guild.id, subject.subject_type, subject.subject_id, permission.toString());
    return respond.reply(message, 'good', `I revoked fake permission \`${permission}\`.`);
  }
};
