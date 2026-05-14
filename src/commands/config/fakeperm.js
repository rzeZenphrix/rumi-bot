const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { extractId } = require('../../utils/resolveUser');
const { findRole, findMember } = require('../../utils/moderationSimple');
const { STAFF_FAKE_PERMISSIONS } = require('../../systems/staff/staffManager');

const RUMI_PERMISSIONS = new Set([
  ...STAFF_FAKE_PERMISSIONS,
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

function prettyPermission(permission) {
  const text = String(permission || '');
  const native = Object.entries(PermissionFlagsBits).find(([, value]) => value.toString() === text);
  return native?.[0] || text;
}

async function resolveSubject(message, input) {
  const raw = String(input || '');
  const role = raw.match(/^<@&(\d{17,20})>$/)?.[1];
  const user = raw.match(/^<@!?(\d{17,20})>$/)?.[1];

  if (role) {
    const found = message.guild.roles.cache.get(role) || await message.guild.roles.fetch(role).catch(() => null);
    if (!found || found.id === message.guild.id || found.managed) return null;
    return { subject_type: 'role', subject_id: found.id, label: `${found}` };
  }

  if (user) {
    return { subject_type: 'user', subject_id: user, label: `<@${user}>` };
  }

  const id = extractId(raw);
  if (id) {
    const roleById = message.guild.roles.cache.get(id) || await message.guild.roles.fetch(id).catch(() => null);
    if (roleById) {
      if (roleById.id === message.guild.id || roleById.managed) return null;
      return { subject_type: 'role', subject_id: roleById.id, label: `${roleById}` };
    }

    const memberById = await message.guild.members.fetch(id).catch(() => null);
    if (memberById) return { subject_type: 'user', subject_id: memberById.id, label: `${memberById}` };

    return { subject_type: 'user', subject_id: id, label: `<@${id}>` };
  }

  const foundRole = await findRole(message.guild, raw);
  if (foundRole) {
    if (foundRole.id === message.guild.id || foundRole.managed) return null;
    return { subject_type: 'role', subject_id: foundRole.id, label: `${foundRole}` };
  }

  const foundMember = await findMember(message.guild, raw);
  if (foundMember) return { subject_type: 'user', subject_id: foundMember.id, label: `${foundMember}` };

  return null;
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

function subjectLabel(row) {
  return row.subject_type === 'role' ? `<@&${row.subject_id}>` : `<@${row.subject_id}>`;
}

function availablePermissionsText() {
  const native = Object.keys(PermissionFlagsBits)
    .filter((name) => /^[A-Z]/.test(name))
    .sort();
  const rumi = [...RUMI_PERMISSIONS].sort();

  return [
    '**Rumi fake permissions**',
    rumi.map((permission) => `\`${permission}\``).join(', '),
    '',
    '**Discord permission aliases**',
    native.slice(0, 45).map((permission) => `\`${permission}\``).join(', ')
  ].join('\n').slice(0, 3900);
}

module.exports = {
  name: 'fakeperm',
  aliases: ['fp', 'fakeperms', 'fakepermission'],
  category: 'config',
  description: 'Manage fake permissions stored in for command access.',
  usage: 'fakeperm <grant|revoke|list|permissions> ...',
  examples: ['fakeperm grant @role ManageMessages', 'fakeperm revoke @user BanMembers', 'fakeperm list', 'fakeperm permissions'],
  subcommands: [
    { name: 'grant', description: 'Grant a fake permission to a user or role.', usage: 'grant <@user|@role> <permission>' },
    { name: 'revoke', description: 'Remove a fake permission.', usage: 'revoke <@user|@role> <permission>' },
    { name: 'list', aliases: ['all'], description: 'List fake permissions for this server.', usage: 'list [search] [page]' },
    { name: 'permissions', aliases: ['available', 'types'], description: 'List fake permission names Rumi understands.', usage: 'permissions' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'permissions' || sub === 'available' || sub === 'types') {
      return respond.reply(message, 'info', null, {
        title: 'Available Fake Permissions',
        description: availablePermissionsText(),
        mentionUser: false
      });
    }

    if (sub === 'list' || sub === 'all') {
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

      const lines = slice.map((row) => `${subjectLabel(row)} - \`${prettyPermission(row.permission)}\``);

      return respond.reply(
        message,
        'info',
        lines.length
          ? `Fake permissions${query ? ` for \`${query}\`` : ''}.\nPage ${currentPage}/${pageCount}\n\n${lines.join('\n')}`
          : 'I have no fake permissions saved for this server.'
      );
    }

    if (!['grant', 'revoke'].includes(sub)) {
      return respond.reply(message, 'info', 'Use `fakeperm grant`, `fakeperm revoke`, `fakeperm list`, or `fakeperm permissions`.');
    }

    const subject = await resolveSubject(message, args.shift());
    const permission = permissionFromName(args.shift());

    if (!subject || !permission) {
      return respond.reply(message, 'info', `You can use:\n\`fakeperm ${sub} @member permission\`\n\`fakeperm ${sub} @user permission\`.`);
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

      return respond.reply(message, 'good', `I granted **\`${prettyPermission(permission)}\`** to ${subject.label}.`);
    }

    const removed = await db.removeFakePermission(message.guild.id, subject.subject_type, subject.subject_id, permission.toString()).catch(() => null);
    if (!removed) {
      return respond.reply(message, 'bad', 'I could not revoke that fake permission because the database is currently unreachable.');
    }

    return respond.reply(message, 'good', `I revoked **\`${prettyPermission(permission)}\`** from ${subject.label}.`);
  }
};
