const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const { ok, bad, info, findMember, findRole } = require('../../utils/moderationSimple');

const SNAP_NS = 'moderation:roleSnapshots';

async function getStore() {
  return db.getKv(SNAP_NS, 'global', { guilds: {} });
}

async function saveStore(store) {
  return db.setKv(SNAP_NS, 'global', store);
}

function parseHex(input) {
  const raw = String(input || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(raw) ? Number.parseInt(raw, 16) : null;
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
  description: 'Add, remove, toggle, inspect, color, delete, or restore roles.',
  usage: 'role [add|remove|info|color|delete|restore] ...',
  examples: ['role @user Member', 'role add @user Member', 'role remove @user Member', 'role info Staff'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],

  async execute({ message, args }) {
    const first = (args.shift() || '').toLowerCase();

    if (!first) return info(message, '> **Add or remove a role from a user.**\n\n```role <member> <role>```\n\n-# This will add the specified role to the specified member. You can also use "remove" instead of "add" to remove a role, or "toggle" to add or remove based on whether the member already has the role. If the first argument is a valid subcommand, you must specify the member as the second argument for add/remove operations.');

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

      return ok(message, 'good', `**Restored** ${role.name} to ${assigned} member(s).`);
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

      await snapshotRole(message.guild, role, 'before color change');
      await role.setColor(color, `Role color changed by ${message.author.tag}`);

      return ok(message, 'good', `**Changed** ${role.name} color.`);
    }

    if (first === 'delete') {
      const role = await findRole(message.guild, args.join(' '));
      if (!role) return info(message, '> **Delete a role.**\n\n```role delete <role>```');

      await snapshotRole(message.guild, role, 'before delete');
      const name = role.name;
      await role.delete(`Role deleted by ${message.author.tag}`);

      return ok(message, 'good', `**Deleted** ${name}. Use \`role restore\` if needed.`);
    }

    const mode = ['add', 'remove'].includes(first) ? first : 'toggle';
    const memberArg = mode === 'toggle' ? first : args.shift();
    const member = await findMember(message.guild, memberArg);
    const role = await findRole(message.guild, args.join(' '));

    if (!member || !role) return info(message, '> **Add or remove a role from a user.**\n\n```role <member> <role>```');

    if (mode === 'add' || (mode === 'toggle' && !member.roles.cache.has(role.id))) {
      await member.roles.add(role, `Role added by ${message.author.tag}`);
      return ok(message, 'add', `**Added** ${role.name} to ${member.user.tag}.`);
    }

    await member.roles.remove(role, `Role removed by ${message.author.tag}`);
    return ok(message, 'remove', `**Removed** ${role.name} from ${member.user.tag}.`);
  }
};