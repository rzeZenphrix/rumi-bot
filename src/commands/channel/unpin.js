const { PermissionFlagsBits } = require('discord.js');
const { ok, bad, info, msgId, modlog } = require('../../utils/moderationSimple');

module.exports = {
  name: 'unpin',
  aliases: ['unpinmsg'],
  category: 'moderation',
  description: 'Unpin a message.',
  usage: 'unpin [messageId|messageLink]',
  examples: ['unpin', 'unpin 123456789012345678'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
  cooldown: 3,

  async execute({ message, args }) {
    const targetId = message.reference?.messageId || msgId(args[0]);
    if (!targetId) return info(message, 'Reply to a pinned message or use `unpin <messageId>`.');

    const target = await message.channel.messages.fetch(targetId).catch(() => null);
    if (!target) return bad(message, 'Message not found.');
    if (!target.pinned) return info(message, 'That message is not pinned.');

    await target.unpin(`Unpinned by ${message.author.tag}`);
    await modlog(message, 'unpin', target.author?.id || null, 'Manual unpin', {
      channelId: message.channel.id,
      messageId: target.id
    });

    return ok(message, `Unpinned message: ${target.url}`);
  }
};