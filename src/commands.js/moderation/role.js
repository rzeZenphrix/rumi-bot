const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const { readStore, writeStore } = require('../../systems/storage/jsonStore');
const { fetchBuffer, firstAttachment } = require('../../utils/media');

function roleStore() {
  return readStore('roleSnapshots', { guilds: {} });
}

function saveRoleStore(store) {
  return writeStore('roleSnapshots', store);
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

function snapshotRole(guild, role, reason = 'manual snapshot') {
  const store = roleStore();
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
  saveRoleStore(store);
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
  description: 'Manage roles, role colors, role icons, role assignment, and role restore snapshots.',
  usage: 'role <add|remove|color|cancel|restore|hoist|delete|info|bots remove|humans remove|icon> ...',
  examples: [
    'role add @user Member',
    'role remove @user Muted',
    'role color Staff #ff3366',
    'role hoist Staff true',
    'role bots remove Muted',
    'role humans remove Muted',
    'role icon Booster <attachment/url/emoji>',
    'role delete OldRole',
    'role restore'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles],

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();
    if (!sub) return respond.reply(message, 'info', 'Usage: `role <add|remove|color|hoist|delete|info|bots remove|humans remove|icon|restore> ...`.');

    if (sub === 'restore' || sub === 'cancel') {
      const store = roleStore();
      const snap = store.guilds[message.guild.id]?.shift();
      if (!snap) return respond.reply(message, 'bad', 'No role snapshot is available to restore.');
      saveRoleStore(store);

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
      snapshotRole(message.guild, role, 'before color change');
      await role.setColor(color, `Role color changed by ${message.author.tag}`);
      return respond.reply(message, 'good', `Changed **${role.name}** color to **#${color.toString(16).padStart(6, '0')}**.`);
    }

    if (sub === 'hoist') {
      const roleArg = args.shift();
      const role = await findRole(message.guild, roleArg);
      const value = /^(true|yes|on|show|1)$/i.test(args[0] || '');
      if (!role) return respond.reply(message, 'info', 'Usage: `role hoist <role> <true|false>`.');
      snapshotRole(message.guild, role, 'before hoist change');
      await role.setHoist(value, `Role hoist changed by ${message.author.tag}`);
      return respond.reply(message, 'good', `${value ? 'Hoisted' : 'Unhoisted'} **${role.name}**.`);
    }

    if (sub === 'delete') {
      const role = await findRole(message.guild, args.join(' '));
      if (!role) return respond.reply(message, 'info', 'Usage: `role delete <role>`.');
      snapshotRole(message.guild, role, 'before delete');
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
      snapshotRole(message.guild, role, 'before icon change');
      return setRoleIcon(message, role, args);
    }

    return respond.reply(message, 'bad', `Unknown role action: \`${sub}\`.`);
  }
};
