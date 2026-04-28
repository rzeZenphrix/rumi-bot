const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { createPagedMessage } = require('../../utils/pagedMessages');
const { findMember } = require('../../utils/memberResolver');

const PERMISSION_NAME_BY_VALUE = new Map(
  Object.entries(PermissionFlagsBits).map(([name, value]) => [value.toString(), name])
);

function chunk(items = [], size = 12) {
  const pages = [];
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size));
  }
  return pages;
}

function prettyPermission(value) {
  const resolved = PERMISSION_NAME_BY_VALUE.get(String(value)) || String(value);
  return resolved
    .replace(/^Rumi/, 'Rumi ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
}

function collectFakePermissions(rows = [], member) {
  const roleIds = new Set(member.roles.cache.keys());
  const seen = new Set();
  const output = [];

  for (const row of rows) {
    const direct = row.subject_type === 'user' && row.subject_id === member.id;
    const viaRole = row.subject_type === 'role' && roleIds.has(row.subject_id);
    if (!direct && !viaRole) continue;

    const label = prettyPermission(row.permission);
    const source = direct ? 'Direct grant' : `Role <@&${row.subject_id}>`;
    const key = `${label}:${source}`;
    if (seen.has(key)) continue;
    seen.add(key);

    output.push(`${label} - ${source}`);
  }

  return output.sort((left, right) => left.localeCompare(right));
}

module.exports = {
  name: 'permissions',
  aliases: ['perms'],
  category: 'server',
  description: 'Shows a member permissions summary, including fake permissions.',
  usage: 'permissions [user]',
  examples: ['permissions', 'permissions @buchi', 'permissions buchi'],
  guildOnly: true,

  async execute({ message, args }) {
    await message.guild.members.fetch().catch(() => null);
    const query = args.join(' ').trim();
    const member = (await findMember(message.guild, query, message.author.id)) || message.member;

    if (!member) {
      return respond.reply(message, 'bad', 'I could not find that member.');
    }

    const nativePermissions = member.permissions.toArray().map(prettyPermission).sort((left, right) => left.localeCompare(right));
    const fakePermissionRows = await db.listFakePermissions(message.guild.id).catch(() => null);
    const fakePermissions = fakePermissionRows ? collectFakePermissions(fakePermissionRows, member) : [];

    const pages = [
      {
        title: `Permissions | ${member.user.tag}`,
        allowTitle: true,
        thumbnail: member.displayAvatarURL({ dynamic: true }),
        description: `${member} currently has **${nativePermissions.length}** native permission(s) and **${fakePermissions.length}** fake permission(s).`,
        fields: [
          {
            name: 'Highest role',
            value: member.roles.highest ? `${member.roles.highest}` : 'None',
            inline: true
          },
          {
            name: 'Role count',
            value: String(Math.max(0, member.roles.cache.size - 1)),
            inline: true
          },
          {
            name: 'Fake permission lookup',
            value: fakePermissionRows ? 'Available' : 'Unavailable right now',
            inline: true
          }
        ],
        mentionUser: false
      }
    ];

    for (const [pageIndex, slice] of chunk(nativePermissions, 12).entries()) {
      pages.push({
        title: `Permissions | ${member.user.tag}`,
        allowTitle: true,
        description: slice.map((permission, index) => `**${pageIndex * 12 + index + 1}.** ${permission}`).join('\n'),
        fields: [
          {
            name: 'Native permissions',
            value: `${slice.length} shown on this page`,
            inline: false
          }
        ],
        footer: {
          text: `Native permissions`
        },
        mentionUser: false
      });
    }

    if (fakePermissionRows === null) {
      pages.push({
        title: `Permissions | ${member.user.tag}`,
        allowTitle: true,
        description: 'I could not load fake permissions because the database is currently unavailable.',
        mentionUser: false
      });
    } else if (fakePermissions.length) {
      for (const slice of chunk(fakePermissions, 12)) {
        pages.push({
          title: `Permissions | ${member.user.tag}`,
          allowTitle: true,
          description: slice.map((line, index) => `**${index + 1}.** ${line}`).join('\n'),
          footer: {
            text: 'Fake permissions'
          },
          mentionUser: false
        });
      }
    } else {
      pages.push({
        title: `Permissions | ${member.user.tag}`,
        allowTitle: true,
        description: 'No fake permissions are active for this member.',
        footer: {
          text: 'Fake permissions'
        },
        mentionUser: false
      });
    }

    const payload = createPagedMessage({
      prefix: 'permissions',
      ownerId: message.author.id,
      guildId: message.guild.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
