const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { extractId } = require('../../utils/resolveUser');
const { fetchBuffer, firstAttachment } = require('../../utils/media');
const { getRoleAutomationConfig, updateRoleAutomationConfig } = require('../../systems/automation/serverRoles');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

async function roleStore() {
  return db.getKv('moderation:roleSnapshots', 'global', { guilds: {} });
}

async function saveRoleStore(store) {
  return db.setKv('moderation:roleSnapshots', 'global', store);
}

async function findRole(guild, input) {
  if (!input) return null;
  const id = String(input).match(/^<@&(\d{17,20})>$/)?.[1] || (extractId(input) ? extractId(input) : null);
  if (id) return guild.roles.cache.get(id) || guild.roles.fetch(id).catch(() => null);
  const q = String(input).toLowerCase();
  return guild.roles.cache.find((r) => r.name.toLowerCase() === q || r.name.toLowerCase().includes(q));
}

async function findMember(guild, input) {
  const id = extractId(input);
  if (id) return guild.members.fetch(id).catch(() => null);
  const q = String(input || '').toLowerCase();
  return guild.members.cache.find((m) => m.user.tag.toLowerCase() === q || m.user.username.toLowerCase() === q || (m.nickname || '').toLowerCase() === q) || null;
}

function parseHex(input) {
  const raw = String(input || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return null;
  return Number.parseInt(raw, 16);
}

function formatRoleList(guild, roleIds = []) {
  if (!roleIds.length) return 'none';
  return roleIds
    .map((roleId) => guild.roles.cache.get(roleId))
    .filter(Boolean)
    .map((role) => role.toString())
    .join(', ') || 'none';
}

async function handleJoinRoles(message, args) {
  const action = String(args.shift() || 'list').toLowerCase();
  const access = await getPremiumAccessForMessage(message).catch(() => null);
  const limit = access?.limits?.joinRoles || 10;
  const config = await getRoleAutomationConfig(message.guild.id);

  if (action === 'list' || action === 'view') {
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Join Roles',
      description: [
        `**Configured:** ${config.joinRoles.length}/${limit}`,
        '',
        formatRoleList(message.guild, config.joinRoles)
      ].join('\n')
    });
  }

  if (action === 'clear' || action === 'reset') {
    await updateRoleAutomationConfig(message.guild.id, (current) => ({
      ...current,
      joinRoles: []
    }));
    return respond.reply(message, 'good', 'Cleared all join roles for this server.');
  }

  const role = await findRole(message.guild, args.join(' '));
  if (!role) {
    return respond.reply(message, 'info', 'Usage: `role join <add|remove|list|clear> <role>`.');
  }

  if (action === 'add') {
    if (config.joinRoles.includes(role.id)) {
      return respond.reply(message, 'info', `**${role.name}** is already a join role.`);
    }
    if (config.joinRoles.length >= limit) {
      return respond.reply(
        message,
        'bad',
        access?.hasServerPremiumBase
          ? `You already used all ${limit} join-role slots.`
          : 'Free servers can configure up to 10 join roles. Server premium raises that to 25.'
      );
    }

    await updateRoleAutomationConfig(message.guild.id, (current) => ({
      ...current,
      joinRoles: [...new Set([...(current.joinRoles || []), role.id])]
    }));
    return respond.reply(message, 'good', `Added ${role} to the join-role list.`);
  }

  if (action === 'remove' || action === 'delete') {
    await updateRoleAutomationConfig(message.guild.id, (current) => ({
      ...current,
      joinRoles: (current.joinRoles || []).filter((roleId) => roleId !== role.id)
    }));
    return respond.reply(message, 'good', `Removed ${role} from the join-role list.`);
  }

  return respond.reply(message, 'info', 'Usage: `role join <add|remove|list|clear> <role>`.');
}

function resolveConnectionRoles(message, args) {
  const mentioned = [...message.mentions.roles.values()];
  if (mentioned.length >= 2) {
    return {
      parentRole: mentioned[0],
      childRole: mentioned[1]
    };
  }

  return {
    parentInput: args.shift() || '',
    childInput: args.join(' ')
  };
}

function describeConnections(guild, config) {
  const parents = Object.entries(config.roleConnections || {});
  if (!parents.length) return 'none';
  return parents
    .map(([parentId, childIds]) => {
      const parent = guild.roles.cache.get(parentId);
      const children = formatRoleList(guild, childIds);
      return `${parent ? parent.toString() : `\`${parentId}\``} -> ${children}`;
    })
    .join('\n')
    .slice(0, 4000);
}

async function handleRoleConnections(message, args) {
  const action = String(args.shift() || 'list').toLowerCase();
  const access = await getPremiumAccessForMessage(message).catch(() => null);
  const config = await getRoleAutomationConfig(message.guild.id);
  const parentLimit = access?.limits?.roleConnectionParents || 5;
  const childLimit = access?.limits?.roleConnectionChildren || 10;

  if (action === 'list' || action === 'view') {
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Role Connections',
      description: [
        `**Parent roles:** ${Object.keys(config.roleConnections || {}).length}/${parentLimit}`,
        `**Child links per parent:** ${childLimit}`,
        '',
        describeConnections(message.guild, config)
      ].join('\n')
    });
  }

  const roleInputs = resolveConnectionRoles(message, [...args]);
  const parentRole = roleInputs.parentRole || await findRole(message.guild, roleInputs.parentInput);
  const childRole = roleInputs.childRole || await findRole(message.guild, roleInputs.childInput);

  if (action === 'clear' || action === 'reset') {
    if (!parentRole) {
      return respond.reply(message, 'info', 'Usage: `role connect clear <parent-role>`.');
    }

    await updateRoleAutomationConfig(message.guild.id, (current) => {
      const next = { ...(current.roleConnections || {}) };
      delete next[parentRole.id];
      return {
        ...current,
        roleConnections: next
      };
    });
    return respond.reply(message, 'good', `Cleared all role connections for ${parentRole}.`);
  }

  if (!parentRole || !childRole) {
    return respond.reply(message, 'info', 'Usage: `role connect <add|remove|list|clear> <parent-role> <child-role>`.');
  }

  if (parentRole.id === childRole.id) {
    return respond.reply(message, 'bad', 'A role cannot be connected to itself.');
  }

  const currentChildren = config.roleConnections?.[parentRole.id] || [];

  if (action === 'add') {
    if (!config.roleConnections?.[parentRole.id] && Object.keys(config.roleConnections || {}).length >= parentLimit) {
      return respond.reply(
        message,
        'bad',
        access?.hasServerPremiumBase
          ? `You already used all ${parentLimit} parent-role connection slots.`
          : 'Free servers can configure up to 5 parent roles. Server premium raises that to 15.'
      );
    }

    if (currentChildren.includes(childRole.id)) {
      return respond.reply(message, 'info', `${childRole} is already connected to ${parentRole}.`);
    }

    if (currentChildren.length >= childLimit) {
      return respond.reply(
        message,
        'bad',
        access?.hasServerPremiumBase
          ? `You already used all ${childLimit} connected-role slots for ${parentRole}.`
          : 'Free servers can configure up to 10 child role connections per parent. Server premium raises that to 15.'
      );
    }

    await updateRoleAutomationConfig(message.guild.id, (current) => {
      const next = { ...(current.roleConnections || {}) };
      next[parentRole.id] = [...new Set([...(next[parentRole.id] || []), childRole.id])];
      return {
        ...current,
        roleConnections: next
      };
    });
    return respond.reply(message, 'good', `Connected ${childRole} to ${parentRole}.`);
  }

  if (action === 'remove' || action === 'delete') {
    await updateRoleAutomationConfig(message.guild.id, (current) => {
      const next = { ...(current.roleConnections || {}) };
      next[parentRole.id] = (next[parentRole.id] || []).filter((roleId) => roleId !== childRole.id);
      if (!next[parentRole.id].length) delete next[parentRole.id];
      return {
        ...current,
        roleConnections: next
      };
    });
    return respond.reply(message, 'good', `Removed the ${childRole} connection from ${parentRole}.`);
  }

  return respond.reply(message, 'info', 'Usage: `role connect <add|remove|list|clear> <parent-role> <child-role>`.');
}

async function snapshotRole(guild, role, reason = 'manual snapshot') {
  const store = await roleStore();
  store.guilds[guild.id] ||= [];
  store.guilds[guild.id].unshift({
    roleId: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    position: role.rawPosition,
    icon: role.iconURL({ size: 256 }) || null,
    memberIds: role.members.map((m) => m.id),
    reason,
    createdAt: new Date().toISOString()
  });
  store.guilds[guild.id] = store.guilds[guild.id].slice(0, 20);
  await saveRoleStore(store);
}

async function bulkRemoveRole(guild, role, predicate) {
  await guild.members.fetch().catch(() => null);
  const members = guild.members.cache.filter((member) => member.roles.cache.has(role.id) && predicate(member));
  let removed = 0;
  for (const member of members.values()) {
    await member.roles.remove(role).then(() => { removed += 1; }).catch(() => null);
  }
  return removed;
}

async function setRoleIcon(message, role, args) {
  const input = args.join(' ').trim();
  if (/^clear|remove|none$/i.test(input)) {
    await role.setIcon(null, `Role icon cleared by ${message.author.tag}`);
    return respond.reply(message, 'good', `Cleared the icon for **${role.name}**.`);
  }

  const attachment = firstAttachment(message);
  const emoji = input.match(/^<a?:\w{2,32}:(\d{17,20})>$/);
  const unicodeEmoji = input && !/^https?:\/\//i.test(input) && !attachment && !emoji ? input : null;

  let icon;
  if (attachment) icon = await fetchBuffer(attachment.url);
  else if (/^https?:\/\//i.test(input)) icon = await fetchBuffer(input);
  else if (emoji) icon = `https://cdn.discordapp.com/emojis/${emoji[1]}.png`;
  else if (unicodeEmoji) icon = unicodeEmoji;

  if (!icon) return respond.reply(message, 'info', 'Usage: `role icon <role> <url|emoji|attachment|clear>`.');
  await role.setIcon(icon, `Role icon changed by ${message.author.tag}`);
  return respond.reply(message, 'good', `Updated the icon for **${role.name}**.`);
}

module.exports = {
  name: 'role',
  aliases: ['r'],
  category: 'moderation',
  description: 'Manage roles, join roles, role connections, role colors, role icons, role assignment, and role restore snapshots.',
  usage: 'role <add|remove|join|connect|color|cancel|restore|hoist|delete|info|bots remove|humans remove|icon> ...',
  examples: [
    'role add @user Member',
    'role remove @user Muted',
    'role join add @Member',
    'role connect add @Verified @Announcements',
    'role color Staff #ff3366',
    'role hoist Staff true',
    'role bots remove Muted',
    'role humans remove Muted',
    'role icon Booster <attachment/url/emoji>',
    'role delete OldRole',
    'role restore'
  ],
  subcommands: [
    {
      name: 'add',
      description: 'Add a role to a member.',
      usage: 'role add <@member|id|name> <role>',
      examples: ['role add @user Member', 'role add 123456789012345678 Member']
    },
    {
      name: 'remove',
      description: 'Remove a role from a member.',
      usage: 'role remove <@member|id|name> <role>',
      examples: ['role remove @user Muted', 'role remove username Muted']
    },
    {
      name: 'join',
      description: 'Manage automatic join roles for new members.',
      usage: 'role join <add|remove|list|clear> [role]',
      examples: ['role join add @Member', 'role join list'],
      premium: { scope: 'server', tier: 'base' }
    },
    {
      name: 'connect',
      aliases: ['connection', 'connections'],
      description: 'Manage parent and child role connections.',
      usage: 'role connect <add|remove|list|clear> <parent-role> [child-role]',
      examples: ['role connect add @Verified @Announcements', 'role connect list'],
      premium: { scope: 'server', tier: 'base' }
    },
    {
      name: 'restore',
      aliases: ['cancel'],
      description: 'Restore the most recent saved role snapshot.',
      usage: 'role restore',
      examples: ['role restore']
    },
    {
      name: 'bots',
      description: 'Bulk remove a role from bots.',
      usage: 'role bots remove <role>',
      examples: ['role bots remove Muted']
    },
    {
      name: 'humans',
      description: 'Bulk remove a role from human members.',
      usage: 'role humans remove <role>',
      examples: ['role humans remove Muted']
    },
    {
      name: 'color',
      description: 'Change a role color.',
      usage: 'role color <role> <#hex>',
      examples: ['role color Staff #ff3366']
    },
    {
      name: 'hoist',
      description: 'Toggle whether a role is shown separately.',
      usage: 'role hoist <role> <true|false>',
      examples: ['role hoist Staff true']
    },
    {
      name: 'delete',
      description: 'Delete a role and save a restore snapshot first.',
      usage: 'role delete <role>',
      examples: ['role delete OldRole']
    },
    {
      name: 'info',
      description: 'Show information about a role.',
      usage: 'role info <role>',
      examples: ['role info Staff']
    },
    {
      name: 'icon',
      description: 'Set, replace, or clear a role icon.',
      usage: 'role icon <role> <url|emoji|attachment|clear>',
      examples: ['role icon Booster clear', 'role icon Booster https://example.com/icon.png']
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();
    if (!sub) return respond.reply(message, 'info', 'Usage: `role <add|remove|join|connect|color|hoist|delete|info|bots remove|humans remove|icon|restore> ...`.');

    if (sub === 'join' || sub === 'autorole') {
      return handleJoinRoles(message, args);
    }

    if (sub === 'connect' || sub === 'connection' || sub === 'connections') {
      return handleRoleConnections(message, args);
    }

    if (sub === 'restore' || sub === 'cancel') {
      const store = await roleStore();
      const snap = store.guilds[message.guild.id]?.shift();
      if (!snap) return respond.reply(message, 'bad', 'No role snapshot is available to restore.');
      await saveRoleStore(store);

      const restored = await message.guild.roles.create({
        name: snap.name,
        color: snap.color || undefined,
        hoist: snap.hoist,
        mentionable: snap.mentionable,
        permissions: BigInt(snap.permissions || '0'),
        reason: `Role restored by ${message.author.tag}`
      });

      let assigned = 0;
      for (const memberId of snap.memberIds || []) {
        const member = await message.guild.members.fetch(memberId).catch(() => null);
        if (member) await member.roles.add(restored).then(() => { assigned += 1; }).catch(() => null);
      }

      return respond.reply(message, 'good', `Restored **${restored.name}** and reassigned it to **${assigned}** member(s).`);
    }

    if (sub === 'bots' || sub === 'humans') {
      const action = (args.shift() || '').toLowerCase();
      const role = await findRole(message.guild, args.join(' '));
      if (action !== 'remove' || !role) return respond.reply(message, 'info', `Usage: \`role ${sub} remove <role>\`.`);
      const removed = await bulkRemoveRole(message.guild, role, (m) => sub === 'bots' ? m.user.bot : !m.user.bot);
      return respond.reply(message, 'good', `Removed **${role.name}** from **${removed}** ${sub}.`);
    }

    if (sub === 'add' || sub === 'remove') {
      const memberArg = args.shift();
      const member = await findMember(message.guild, memberArg);
      const role = await findRole(message.guild, args.join(' '));
      if (!member || !role) return respond.reply(message, 'info', `Usage: \`role ${sub} <@member|id|name> <role>\`.`);
      if (sub === 'add') await member.roles.add(role, `Role add by ${message.author.tag}`);
      else await member.roles.remove(role, `Role remove by ${message.author.tag}`);
      return respond.reply(message, 'good', `${sub === 'add' ? 'Added' : 'Removed'} **${role.name}** ${sub === 'add' ? 'to' : 'from'} ${member}.`);
    }

    if (sub === 'color') {
      const roleArg = args.shift();
      const role = await findRole(message.guild, roleArg);
      const color = parseHex(args.shift());
      if (!role || color === null) return respond.reply(message, 'info', 'Usage: `role color <role> <#hex>`.');
      await snapshotRole(message.guild, role, 'before color change');
      await role.setColor(color, `Role color changed by ${message.author.tag}`);
      return respond.reply(message, 'good', `Changed **${role.name}** color to **#${color.toString(16).padStart(6, '0')}**.`);
    }

    if (sub === 'hoist') {
      const roleArg = args.shift();
      const role = await findRole(message.guild, roleArg);
      const value = /^(true|yes|on|show|1)$/i.test(args[0] || '');
      if (!role) return respond.reply(message, 'info', 'Usage: `role hoist <role> <true|false>`.');
      await snapshotRole(message.guild, role, 'before hoist change');
      await role.setHoist(value, `Role hoist changed by ${message.author.tag}`);
      return respond.reply(message, 'good', `${value ? 'Hoisted' : 'Unhoisted'} **${role.name}**.`);
    }

    if (sub === 'delete') {
      const role = await findRole(message.guild, args.join(' '));
      if (!role) return respond.reply(message, 'info', 'Usage: `role delete <role>`.');
      await snapshotRole(message.guild, role, 'before delete');
      const name = role.name;
      await role.delete(`Role deleted by ${message.author.tag}`);
      return respond.reply(message, 'good', `Deleted **${name}**. A restore snapshot was saved. Use \`role restore\` if needed.`);
    }

    if (sub === 'info') {
      const role = await findRole(message.guild, args.join(' '));
      if (!role) return respond.reply(message, 'info', 'Usage: `role info <role>`.');
      return respond.reply(message, 'info', null, {
        title: `Role info: ${role.name}`,
        fields: [
          { name: 'ID', value: role.id, inline: true },
          { name: 'Members', value: String(role.members.size), inline: true },
          { name: 'Color', value: role.hexColor, inline: true },
          { name: 'Hoisted', value: String(role.hoist), inline: true },
          { name: 'Mentionable', value: String(role.mentionable), inline: true },
          { name: 'Position', value: String(role.rawPosition), inline: true }
        ]
      });
    }

    if (sub === 'icon') {
      const roleArg = args.shift();
      const role = await findRole(message.guild, roleArg);
      if (!role) return respond.reply(message, 'info', 'Usage: `role icon <role> <url|emoji|attachment|clear>`.');
      await snapshotRole(message.guild, role, 'before icon change');
      return setRoleIcon(message, role, args);
    }

    return respond.reply(message, 'bad', `Unknown role action: \`${sub}\`.`);
  }
};
