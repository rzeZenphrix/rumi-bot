const { PermissionFlagsBits } = require('discord.js');
const { addReactionRole, removeReactionRole, clearReactionRoles, getGuild, countReactionRoleLinks } = require('../../systems/reactionroles/store');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');
const { ok, bad, info, findRole, id } = require('../../utils/moderationSimple');

function parseMessageLink(input) {
  const match = String(input || '').match(/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/);
  return match ? { guildId: match[1], channelId: match[2], messageId: match[3] } : null;
}

async function fetchTargetMessage(message, input) {
  const link = parseMessageLink(input);
  const channelId = link?.channelId || message.channel.id;
  const messageId = link?.messageId || id(input);
  if (!messageId) return null;

  const channel = await message.guild.channels.fetch(channelId).catch(() => null);
  return channel?.messages?.fetch(messageId).catch(() => null);
}

module.exports = {
  name: 'reactionrole',
  aliases: ['rr', 'reactrole', 'reactionroles'],
  category: 'moderation',
  description: 'Manage reaction roles.',
  usage: 'rr [message emoji role|delete|clear|list]',
  examples: ['rr 123 emoji Member', 'rr delete 123 emoji', 'rr clear 123', 'rr'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory],

  async execute({ message, args }) {
    const first = (args.shift() || '').toLowerCase();

    if (!first || first === 'list') {
      const cfg = await getGuild(message.guild.id);
      const lines = Object.entries(cfg.messages || {}).flatMap(([messageId, data]) =>
        Object.entries(data.items || {}).map(([emoji, roleId]) => `${messageId}: ${emoji} -> <@&${roleId}>`)
      );

      return info(message, lines.join('\n') || 'No reaction roles set.');
    }

    if (['delete', 'del', 'remove'].includes(first)) {
      const target = await fetchTargetMessage(message, args.shift());
      const key = args.join(' ');
      if (!target || !key) return info(message, '> **Delete a reaction role**\n\n```rr delete <message> <emoji|role>```\n\n-# You can use either the emoji or the role as the key to delete the reaction role.');

      await removeReactionRole(message.guild.id, target.id, key);
      return ok(message, 'Reaction role **removed.**');
    }

    if (first === 'clear') {
      const target = await fetchTargetMessage(message, args.shift());
      if (!target) return info(message, '> **Clear reaction roles**\n\n```rr clear <message>```\n\n-# This will **remove** all reaction roles from the specified message.');

      await clearReactionRoles(message.guild.id, target.id);
      await target.reactions.removeAll().catch(() => null);

      return ok(message, 'Reaction roles **cleared.**');
    }

    const msgArg = first === 'add' ? args.shift() : first;
    const emoji = args.shift();
    const role = await findRole(message.guild, args.join(' '));
    const target = await fetchTargetMessage(message, msgArg);

    if (!target || !emoji || !role) return info(message, '> **Add a reaction role**\n\n```rr add <message> <emoji> <role>```\n\n-# This will **add** a reaction role to the specified message. It is **optional** to use [add] as the first argument. You can also specify the message with a link or ID as the first argument.');

    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const limit = access?.hasServerPremiumBase ? 500 : 100;
    const count = await countReactionRoleLinks(message.guild.id).catch(() => 0);

    if (count >= limit) return bad(message, `Reaction-role limit reached: ${limit}.`);

    await target.react(emoji).catch(() => null);
    await addReactionRole(message.guild.id, target.channel.id, target.id, emoji, role.id);

    return ok(message, 'good', `Reaction role **added:** ${emoji} -> ${role.name}.`);
  }
};
