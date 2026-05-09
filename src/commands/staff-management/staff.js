const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const {
  STAFF_FAKE_PERMISSIONS,
  addStaffRole,
  removeStaffRole,
  listStaffRoles,
  setRoleFakePermissions,
  removeRoleFakePermissions,
  clearRoleFakePermissions,
  staffStripMember,
  normalizePermissionList
} = require('../../systems/staff/staffManager');

function extractId(value = '') {
  return String(value || '').match(/\d{15,25}/)?.[0] || null;
}

function resolveRole(message, token) {
  const mentioned = message.mentions.roles.first();
  if (mentioned) return mentioned;

  const id = extractId(token);
  if (id) return message.guild.roles.cache.get(id) || null;

  const query = String(token || '').toLowerCase();
  return message.guild.roles.cache.find((role) =>
    role.name.toLowerCase() === query ||
    role.name.toLowerCase().includes(query)
  ) || null;
}

async function resolveMember(message, token) {
  const mentioned = message.mentions.members.first();
  if (mentioned) return mentioned;

  const id = extractId(token);
  if (id) return message.guild.members.fetch(id).catch(() => null);

  const query = String(token || '').toLowerCase();

  return message.guild.members.cache.find((member) =>
    member.user.username.toLowerCase() === query ||
    member.displayName.toLowerCase() === query ||
    member.user.username.toLowerCase().includes(query) ||
    member.displayName.toLowerCase().includes(query)
  ) || null;
}

function formatStaffRoles(rows = [], guild) {
  if (!rows.length) return 'No staff roles configured.';

  return rows.map((row) => {
    const role = guild.roles.cache.get(row.role_id);
    const name = role ? `<@&${role.id}>` : `Unknown role (${row.role_id})`;
    const flags = [
      row.strip_on_staff_strip ? 'strip' : 'no-strip',
      row.protected_from_staff_strip ? 'protected' : null
    ].filter(Boolean).join(', ');

    return `• ${name} — ${flags}`;
  }).join('\n');
}

async function listRoleFakePermissions(guildId, roleId) {
  const rows = await db.listFakePermissions(guildId).catch(() => []);
  return rows.filter((row) => row.subject_type === 'role' && row.subject_id === roleId);
}

module.exports = {
  name: 'staff',
  aliases: [],
  category: 'security',
  description: 'Manage server staff roles and fake permissions.',
  usage: [
    'staff status',
    'staff role add @role',
    'staff role remove @role',
    'staff role list',
    'staff fakeperm add @role permission',
    'staff fakeperm remove @role permission',
    'staff fakeperm list @role',
    'staff fakeperm clear @role',
    'staff strip @user'
  ],
  examples: [
    'staff role add @Moderator',
    'staff fakeperm add @Moderator RumiUseModCommands',
    'staff fakeperm add @Security RumiBypassAutomod RumiUseSecurityCommands',
    'staff strip @CompromisedAdmin'
  ],
  subcommands: [
    {
      name: 'status',
      description: 'Show configured staff roles.',
      usage: ['staff status'],
      examples: ['staff status']
    },
    {
      name: 'role',
      description: 'Add, remove, or list staff roles.',
      usage: ['staff role add @role', 'staff role remove @role', 'staff role list'],
      examples: ['staff role add @Moderator', 'staff role list']
    },
    {
      name: 'fakeperm',
      aliases: ['permission', 'perm'],
      description: 'Assign fake Rumi permissions to staff roles.',
      usage: [
        'staff fakeperm add @role permission',
        'staff fakeperm remove @role permission',
        'staff fakeperm list @role',
        'staff fakeperm clear @role'
      ],
      examples: [
        'staff fakeperm add @Moderator RumiUseModCommands',
        'staff fakeperm remove @Moderator RumiBypassAutomod',
        'staff fakeperm list @Moderator'
      ]
    },
    {
      name: 'strip',
      description: 'Remove configured staff roles from a member.',
      usage: ['staff strip @user', 'staff strip user-id', 'staff strip username'],
      examples: ['staff strip @CompromisedAdmin']
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'status').toLowerCase();

    if (sub === 'status' || sub === 'list') {
      const rows = await listStaffRoles(message.guild.id).catch(() => []);

      return respond.reply(message, 'info', null, {
        title: 'Staff Management',
        description: formatStaffRoles(rows, message.guild),
        fields: [
          {
            name: 'Known fake permissions',
            value: STAFF_FAKE_PERMISSIONS.map((permission) => `\`${permission}\``).join(', ').slice(0, 1024)
          }
        ],
        mentionUser: false
      });
    }

    if (sub === 'role') {
      const action = String(args.shift() || '').toLowerCase();

      if (action === 'list') {
        const rows = await listStaffRoles(message.guild.id).catch(() => []);

        return respond.reply(message, 'info', null, {
          title: 'Configured Staff Roles',
          description: formatStaffRoles(rows, message.guild),
          mentionUser: false
        });
      }

      const role = resolveRole(message, args.shift());

      if (!role) {
        return respond.reply(message, 'info', [
          '**Usage**',
          '```txt',
          'staff role add @role',
          'staff role remove @role',
          'staff role list',
          '```'
        ].join('\n'));
      }

      if (action === 'add') {
        const row = await addStaffRole({
          guildId: message.guild.id,
          roleId: role.id,
          label: role.name,
          addedBy: message.author.id
        }).catch(() => null);

        if (!row) {
          return respond.reply(message, 'bad', 'I could not save that staff role.');
        }

        return respond.reply(message, 'good', `${role} is now a server staff role.`);
      }

      if (action === 'remove' || action === 'delete') {
        await removeStaffRole({
          guildId: message.guild.id,
          roleId: role.id,
          clearFakePermissions: false
        }).catch(() => null);

        return respond.reply(message, 'good', `${role} is no longer a server staff role.`);
      }

      return respond.reply(message, 'info', 'Use `staff role <add|remove|list> <@role>`.');
    }

    if (sub === 'fakeperm' || sub === 'permission' || sub === 'perm') {
      const action = String(args.shift() || '').toLowerCase();
      const role = resolveRole(message, args.shift());

      if (!role) {
        return respond.reply(message, 'info', [
          '**Usage**',
          '```txt',
          'staff fakeperm add @role permission',
          'staff fakeperm remove @role permission',
          'staff fakeperm list @role',
          'staff fakeperm clear @role',
          '```'
        ].join('\n'));
      }

      if (action === 'list') {
        const rows = await listRoleFakePermissions(message.guild.id, role.id);

        return respond.reply(message, 'info', null, {
          title: `Fake Permissions: ${role.name}`,
          description: rows.length
            ? rows.map((row) => `• \`${row.permission}\``).join('\n')
            : 'No fake permissions assigned to this role.',
          mentionUser: false
        });
      }

      if (action === 'clear') {
        await clearRoleFakePermissions(message.guild.id, role.id).catch(() => null);
        return respond.reply(message, 'good', `Cleared fake permissions from ${role}.`);
      }

      const permissions = normalizePermissionList(args);

      if (!permissions.length) {
        return respond.reply(message, 'info', 'Provide at least one fake permission.');
      }

      if (action === 'add') {
        await setRoleFakePermissions(message.guild.id, role.id, permissions, message.author.id).catch(() => null);

        return respond.reply(
          message,
          'good',
          `Added fake permission(s) to ${role}: ${permissions.map((permission) => `\`${permission}\``).join(', ')}`
        );
      }

      if (action === 'remove' || action === 'delete') {
        await removeRoleFakePermissions(message.guild.id, role.id, permissions).catch(() => null);

        return respond.reply(
          message,
          'good',
          `Removed fake permission(s) from ${role}: ${permissions.map((permission) => `\`${permission}\``).join(', ')}`
        );
      }

      return respond.reply(message, 'info', 'Use `staff fakeperm <add|remove|list|clear> @role [permission]`.');
    }

    if (sub === 'strip' || sub === 'staffstrip') {
      const member = await resolveMember(message, args.join(' '));

      if (!member) {
        return respond.reply(message, 'info', [
          '**Usage**',
          '```txt',
          'staff strip @user',
          'staff strip user-id',
          'staff strip username',
          '```'
        ].join('\n'));
      }

      if (member.id === message.guild.ownerId) {
        return respond.reply(message, 'bad', 'I cannot staff-strip the server owner.');
      }

      const result = await staffStripMember(member, {
        reason: `Staff strip by ${message.author.tag}`
      });

      return respond.reply(message, result.failed.length ? 'warn' : 'good', null, {
        title: 'Staff Strip Complete',
        description: [
          `Target: ${member}`,
          `Removed: **${result.removed.length}**`,
          `Failed: **${result.failed.length}**`,
          `Skipped: **${result.skipped.length}**`
        ].join('\n'),
        fields: [
          {
            name: 'Removed roles',
            value: result.removed.length
              ? result.removed.map((role) => `• ${role.roleName}`).join('\n').slice(0, 1024)
              : 'None'
          },
          {
            name: 'Failed/skipped',
            value: [...result.failed, ...result.skipped].length
              ? [...result.failed, ...result.skipped].map((item) => `• ${item.roleName || item.roleId}: ${item.reason}`).join('\n').slice(0, 1024)
              : 'None'
          }
        ],
        mentionUser: false
      });
    }

    return respond.reply(message, 'info', 'Use `staff status`, `staff role`, `staff fakeperm`, or `staff strip`.');
  }
};