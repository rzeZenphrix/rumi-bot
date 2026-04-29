const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const {
  addReactionRole,
  removeReactionRole,
  clearReactionRoles,
  getGuild,
  countReactionRoleLinks
} = require('../../systems/reactionroles/store');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

function roleId(input) {
  return String(input || '').match(/^<@&(\d{17,20})>$/)?.[1] || extractId(input);
}

function parseMessageLink(input) {
  const match = String(input || '').match(/channels\/(\d{17,20})\/(\d{17,20})\/(\d{17,20})/);
  if (!match) return null;
  return { guildId: match[1], channelId: match[2], messageId: match[3] };
}

async function fetchTargetMessage(message, input) {
  const link = parseMessageLink(input);
  const channelId = link?.channelId || message.channel.id;
  const messageId = link?.messageId || input;
  if (!extractId(messageId)) return null;
  const channel = await message.guild.channels.fetch(channelId).catch(() => null);
  if (!channel?.messages) return null;
  const target = await channel.messages.fetch(messageId).catch(() => null);
  return target;
}

module.exports = {
  name: 'reactionrole',
  aliases: ['rr', 'reactrole', 'reactionroles'],
  category: 'moderation',
  description: 'Add, remove, clear, or list reaction roles.',
  usage: 'reactionrole <add|remove|clear|list> ...',
  examples: ['rr add 123456789012345678 ✅ Member', 'rr remove 123456789012345678 ✅', 'rr clear 123456789012345678', 'rr list'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageRoles],
  botPermissions: [PermissionFlagsBits.ManageRoles, PermissionFlagsBits.AddReactions, PermissionFlagsBits.ReadMessageHistory],

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();

    if (sub === 'add') {
      const msgArg = args.shift();
      const emoji = args.shift();
      const roleInput = args.join(' ');
      const access = await getPremiumAccessForMessage(message).catch(() => null);
      const limit = access?.hasServerPremiumBase ? 500 : 100;
      const role = roleId(roleInput)
        ? await message.guild.roles.fetch(roleId(roleInput)).catch(() => null)
        : message.guild.roles.cache.find((entry) => entry.name.toLowerCase() === roleInput.toLowerCase());
      const targetMessage = await fetchTargetMessage(message, msgArg);
      if (!targetMessage || !emoji || !role) {
        return respond.reply(message, 'info', 'Usage: `rr add <messageId|messageLink> <emoji> <role>`.');
      }

      const currentCount = await countReactionRoleLinks(message.guild.id).catch(() => 0);
      if (currentCount >= limit) {
        return respond.reply(
          message,
          'bad',
          access?.hasServerPremiumBase
            ? `You already used all ${limit} reaction-role slots for this server.`
            : 'Free servers can store up to 100 reaction roles. Server premium raises that to 500.'
        );
      }

      await targetMessage.react(emoji).catch(() => null);
      await addReactionRole(message.guild.id, targetMessage.channel.id, targetMessage.id, emoji, role.id);
      return respond.reply(message, 'good', `Added reaction role: ${emoji} -> **${role.name}** on [message](${targetMessage.url}).`);
    }

    if (sub === 'remove') {
      const msgArg = args.shift();
      const key = args.join(' ');
      const targetMessage = await fetchTargetMessage(message, msgArg);
      if (!targetMessage || !key) return respond.reply(message, 'info', 'Usage: `rr remove <messageId|messageLink> <emoji|role>`.');
      await removeReactionRole(message.guild.id, targetMessage.id, key);
      return respond.reply(message, 'good', `Removed matching reaction role from [message](${targetMessage.url}).`);
    }

    if (sub === 'clear') {
      const targetMessage = await fetchTargetMessage(message, args.shift());
      if (!targetMessage) return respond.reply(message, 'info', 'Usage: `rr clear <messageId|messageLink>`.');
      await clearReactionRoles(message.guild.id, targetMessage.id);
      await targetMessage.reactions.removeAll().catch(() => null);
      return respond.reply(message, 'good', `Cleared reaction roles and reactions from [message](${targetMessage.url}).`);
    }

    if (sub === 'list') {
      const config = await getGuild(message.guild.id);
      const lines = Object.entries(config.messages || {}).flatMap(([messageId, data]) => {
        return Object.entries(data.items || {}).map(([emoji, role]) => `**${messageId}** - ${emoji} -> <@&${role}>`);
      });
      return respond.reply(message, 'info', null, {
        title: 'Reaction roles',
        description: lines.join('\n').slice(0, 4096) || 'No reaction roles configured.'
      });
    }

    return respond.reply(message, 'info', 'Usage: `reactionrole <add|remove|clear|list> ...`.');
  }
};
