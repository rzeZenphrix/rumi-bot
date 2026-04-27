const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { extractId } = require('../../utils/resolveUser');

const RUMI_PERMISSIONS = new Set([
  'RumiOwner',
  'RumiAdmin',
  'RumiModerator',
  'RumiManager',
  'RumiBypass',
  'RumiSetup',
  'RumiConfig',
  'RumiSecurity',
  'RumiAntiNuke',
  'RumiAntiRaid',
  'RumiAutoMod',
  'RumiAutoJail',
  'RumiEconomyAdmin',
  'RumiGiveawayAdmin',
  'RumiEmbedManager',
  'RumiCommandManager',
  'RumiDashboardAccess',
  'RumiPremiumManager',
  'RumiBypassCooldowns',
  'RumiBypassAutomod',
  'RumiBypassAntinuke',
  'RumiBypassAntiraid'
]);

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
  const match = Object.entries(PermissionFlagsBits).find(([name]) => name.toLowerCase() === raw);
  if (match) return match[1].toString();
  return [...RUMI_PERMISSIONS].find((name) => name.toLowerCase() === raw) || null;
}

function filterRows(rows, query) {
  const clean = String(query || '').trim().toLowerCase();
  if (!clean) return rows;

  return rows.filter((row) => {
    return row.permission.toLowerCase().includes(clean)
      || row.subject_type.toLowerCase().includes(clean)
      || row.subject_id.includes(clean);
  });
}

module.exports = {
  name: 'fakeperm',
  aliases: ['fp', 'fakeperms', 'fakepermission'],
  category: 'config',
  description: 'Manage fake permissions stored in for command access.',
  usage: 'fakeperm <grant|revoke|list> ...',
  examples: ['fakeperm grant @role ManageMessages', 'fakeperm revoke @user BanMembers', 'fakeperm list', 'fakeperm list role 2'],
  subcommands: [
    { name: 'grant', description: 'Grant a fake permission to a user or role.', usage: 'grant <@user|@role> <permission>' },
    { name: 'revoke', description: 'Remove a fake permission.', usage: 'revoke <@user|@role> <permission>' },
    { name: 'list', description: 'List fake permissions for this server.', usage: 'list [search] [page]' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'list') {
      const tokens = [...args];
      const last = tokens.at(-1);
      const page = /^\d+$/.test(String(last || '')) ? Math.max(1, Number(tokens.pop())) : 1;
      const query = tokens.join(' ').trim();

      const rows = await db.listFakePermissions(message.guild.id).catch(() => null);
      if (!rows) {
        return respond.reply(message, 'bad', 'I could not load fake permissions because the database is currently unreachable.');
      }

      const filtered = filterRows(rows, query);
      const perPage = 12;
      const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
      const currentPage = Math.min(page, pageCount);
      const slice = filtered.slice((currentPage - 1) * perPage, currentPage * perPage);

      const lines = slice.map((row) => {
        const target = row.subject_type === 'role' ? `<@&${row.subject_id}>` : `<@${row.subject_id}>`;
        return `${target} - \`${row.permission}\``;
      });

      return respond.reply(
        message,
        'info',
        lines.length
          ? `Fake permissions${query ? ` for \`${query}\`` : ''}.\nPage ${currentPage}/${pageCount}\n\n${lines.join('\n')}`
          : 'I have no fake permissions saved for this server.'
      );
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
      const saved = await db.upsertFakePermission({
        guild_id: message.guild.id,
        ...subject,
        permission: permission.toString(),
        enabled: true,
        granted_by: message.author.id
      }).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save that fake permission because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `I granted fake permission \`${permission}\`.`);
    }

    const removed = await db.removeFakePermission(message.guild.id, subject.subject_type, subject.subject_id, permission.toString()).catch(() => null);
    if (!removed) {
      return respond.reply(message, 'bad', 'I could not revoke that fake permission because the database is currently unreachable.');
    }

    return respond.reply(message, 'good', `I revoked fake permission \`${permission}\`.`);
  }
};
