const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const { ok, bad, info, findMember, findRole } = require('../../utils/moderationSimple');
const {
  normalizeOptionName,
  upsertRoleOption,
  deleteRoleOption,
  listRoleOptions
} = require('../../systems/roles/roleOptions');

const SNAP_NS = 'moderation:roleSnapshots';

async function getStore() {
  return db.getKv(SNAP_NS, 'global', { guilds: {} });
}

async function saveStore(store) {
  return db.setKv(SNAP_NS, 'global', store);
}

function parseHex(input) {
  const raw = String(input || '').trim().replace('#', '').replace(/^0x/i, '');
  return /^[0-9a-f]{6}$/i.test(raw) ? Number.parseInt(raw, 16) : null;
}

function takeFlag(args, name) {
  const index = args.findIndex((arg) => String(arg || '').toLowerCase() === name);
  if (index === -1) return null;
  const value = args[index + 1] || '';
  args.splice(index, value ? 2 : 1);
  return value || null;
}

function isGuildOwner(message) {
  return message.guild.ownerId === message.author.id;
}

function roleSafetyProblem(message, role, { requireUserManage = true } = {}) {
  if (!role) return 'I could not find that role.';
  if (role.id === message.guild.id) return 'You cannot use @everyone for that.';
  if (role.managed) return 'That role is managed by Discord or an integration, so I cannot manage it.';
  if (!role.editable) return 'That role is above my highest role, so I cannot manage it.';

  if (
    requireUserManage &&
    !isGuildOwner(message) &&
    message.member?.roles?.highest &&
    role.comparePositionTo(message.member.roles.highest) >= 0
  ) {
    return 'That role is at or above your highest role.';
  }

  return null;
}

function parseCreateArgs(args = []) {
  const colorInput = takeFlag(args, '--color') || takeFlag(args, '-c');
  return {
    name: args.join(' ').trim(),
    color: colorInput ? parseHex(colorInput) : null,
    colorInput
  };
}

async function snapshotRole(guild, role, reason) {
  const store = await getStore();
  store.guilds[guild.id] ||= [];
  store.guilds[guild.id].unshift({
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    memberIds: role.members.map((m) => m.id),
    reason,
    createdAt: new Date().toISOString()
  });
  store.guilds[guild.id] = store.guilds[guild.id].slice(0, 10);
  await saveStore(store);
}

module.exports = {
  name: 'role',
  aliases: ['r'],
  category: 'moderation',
  description: 'Create, connect, assign, inspect, update, delete, or restore roles.',
  usage: 'role [add|remove|create|connect|disconnect|list|info|color|rename|delete|restore] ...',
  examples: ['role create Event Host --color #c8d8f2', 'role connect staff @Staff', 'role add @user Member', 'role info Staff'],
  subcommands: [
    { name: 'create', description: 'Create a new Discord role.', usage: 'role create <name> [--color #hex]', examples: ['role create Event Host --color #c8d8f2'] },
    { name: 'connect', aliases: ['link'], description: 'Connect an existing role to a reusable purpose.', usage: 'role connect <purpose> <@role|roleId|roleName>', examples: ['role connect staff @Staff'] },
    { name: 'disconnect', aliases: ['unlink'], description: 'Disconnect a stored role purpose.', usage: 'role disconnect <purpose>', examples: ['role disconnect staff'] },
    { name: 'list', description: 'List connected role purposes.', usage: 'role list', examples: ['role list'] },
    { name: 'info', description: 'View role details.', usage: 'role info <@role|roleId|roleName>', examples: ['role info Staff'] },
    { name: 'rename', description: 'Rename a role.', usage: 'role rename <role> <new name>', examples: ['role rename Staff Team Staff'] },
    { name: 'color', description: 'Change a role color.', usage: 'role color <role> <#hex>', examples: ['role color Staff #c8d8f2'] },
    { name: 'delete', description: 'Delete a role and keep a restore snapshot.', usage: 'role delete <role>', examples: ['role delete Old Staff'] },
    { name: 'restore', description: 'Restore the last deleted/changed role snapshot.', usage: 'role restore', examples: ['role restore'] },
    { name: 'add', description: 'Add a role to a member.', usage: 'role add <member> <role>', examples: ['role add @Rumi Member'] },
    { name: 'remove', description: 'Remove a role from a member.', usage: 'role remove <member> <role>', examples: ['role remove @Rumi Member'] }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],

  async execute({ message, args }) {
    const first = (args.shift() || '').toLowerCase();

    if (!first) return info(message, '> Add or remove a role from a user\n\n```role <member> <role>```\n\n-# This will add the specified role to the specified member. You can also use "remove" instead of "add" to remove a role, or "toggle" to add or remove based on whether the member already has the role. If the first argument is a valid subcommand, you must specify the member as the second argument for add/remove operations.');

    if (first === 'create') {
      const parsed = parseCreateArgs(args);
      if (!parsed.name) return info(message, '> Create a role.\n\n```role create <name> [--color #c8d8f2]\n-# Example\n```role create Event Host --color #c8d8f2```');
      if (parsed.colorInput && parsed.color === null) return bad(message, 'Use a valid role color like `#c8d8f2`.');

      const role = await message.guild.roles.create({
        name: parsed.name.slice(0, 100),
        color: parsed.color ?? undefined,
        reason: `Role created by ${message.author.tag}`
      }).catch((error) => ({ error }));

      if (role?.error) {
        return bad(message, role.error.code === 50013
          ? 'I cannot create that role because of my permissions or role position.'
          : 'Discord rejected that role creation.');
      }

      return ok(message, `Created **${role}**.`);
    }

    if (first === 'connect' || first === 'link') {
      const purpose = normalizeOptionName(args.shift());
      const role = await findRole(message.guild, args.join(' '));
      if (!purpose || !role) return info(message, 'Usage: `role connect <purpose> <@role|roleId|roleName>`.');

      const problem = roleSafetyProblem(message, role);
      if (problem) return bad(message, problem);

      await upsertRoleOption(message.guild.id, purpose, role, {
        connectedBy: message.author.id,
        mode: 'connected'
      });

      return ok(message, `Connected \`${purpose}\` to ${role}.`);
    }

    if (first === 'disconnect' || first === 'unlink') {
      const purpose = normalizeOptionName(args.shift());
      if (!purpose) return info(message, 'Usage: `role disconnect <purpose>`.');

      const removed = await deleteRoleOption(message.guild.id, purpose);
      return removed
        ? ok(message, `Disconnected role purpose \`${purpose}\`.`)
        : info(message, `No role purpose named \`${purpose}\` is connected.`);
    }

    if (first === 'list') {
      const options = await listRoleOptions(message.guild.id).catch(() => []);
      const text = options.length
        ? options.map((item) => `\`${item.name}\` -> <@&${item.roleId}>`).join('\n')
        : 'No role purposes are connected yet.';
      return info(message, text);
    }

    if (first === 'restore') {
      const store = await getStore();
      const snap = store.guilds[message.guild.id]?.shift();
      if (!snap) return bad(message, 'No roles saved for this user.');

      await saveStore(store);

      const role = await message.guild.roles.create({
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
        if (member) await member.roles.add(role).then(() => { assigned += 1; }).catch(() => null);
      }

      return ok(message, 'good', `Restored **${role.name}** to **${assigned}** member(s).`);
    }

    if (first === 'info') {
      const role = await findRole(message.guild, args.join(' '));
      if (!role) return info(message, '> **View information about a role.**\n\n```role info <role>```');

      return info(message, `${role.name}\nID: ${role.id}\nMembers: ${role.members.size}\nColor: ${role.hexColor}\nHoisted: ${role.hoist}\nPosition: ${role.rawPosition}`);
    }

    if (first === 'color') {
      const role = await findRole(message.guild, args.shift());
      const color = parseHex(args.shift());
      if (!role || color === null) return info(message, '> **Change the color of a role.**\n\n```role color <role> <#hex>```\n\n-# Example\n```role color Staff #ff0000```');
      const problem = roleSafetyProblem(message, role);
      if (problem) return bad(message, problem);

      await snapshotRole(message.guild, role, 'before color change');
      await role.setColor(color, `Role color changed by ${message.author.tag}`);

      return ok(message, 'good', `Changed **${role.name}** color.`);
    }

    if (first === 'rename' || first === 'name') {
      const role = await findRole(message.guild, args.shift());
      const nextName = args.join(' ').trim();
      if (!role || !nextName) return info(message, 'Usage: `role rename <role> <new name>`.');
      const problem = roleSafetyProblem(message, role);
      if (problem) return bad(message, problem);

      await snapshotRole(message.guild, role, 'before rename');
      await role.setName(nextName.slice(0, 100), `Role renamed by ${message.author.tag}`);

      return ok(message, `Renamed role to **${role.name}**.`);
    }

    if (first === 'delete') {
      const role = await findRole(message.guild, args.join(' '));
      if (!role) return info(message, '> **Delete a role.**\n\n```role delete <role>```');
      const problem = roleSafetyProblem(message, role);
      if (problem) return bad(message, problem);

      await snapshotRole(message.guild, role, 'before delete');
      const name = role.name;
      await role.delete(`Role deleted by ${message.author.tag}`);

      return ok(message, 'good', `Deleted **${name}**. Use \`role restore\` if needed.`);
    }

    const mode = ['add', 'remove'].includes(first) ? first : 'toggle';
    const memberArg = mode === 'toggle' ? first : args.shift();
    const member = await findMember(message.guild, memberArg);
    const role = await findRole(message.guild, args.join(' '));

    if (!member || !role) return info(message, '> **Add or remove a role from a user.**\n\n```role <member> <role>```');
    const problem = roleSafetyProblem(message, role);
    if (problem) return bad(message, problem);

    if (mode === 'add' || (mode === 'toggle' && !member.roles.cache.has(role.id))) {
      await member.roles.add(role, `Role added by ${message.author.tag}`);
      return ok(message, 'add', `Added **${role.name}** to **${member.user.tag}**.`);
    }

    await member.roles.remove(role, `Role removed by ${message.author.tag}`);
    return ok(message, 'remove', `Removed **${role.name}** from **${member.user.tag}**.`);
  }
};
