const { PermissionFlagsBits } = require('discord.js');
const { ok, bad, info, msgId, modlog } = require('../../utils/moderationSimple');
const respond = require('../../utils/respond');

module.exports = {
  name: 'pin',
  aliases: ['pinmsg', 'pinit'],
  category: 'moderation',
  description: 'Pin a message.',
  usage: 'pin [messageId|messageLink]',
  examples: ['pin', 'pin 123456789012345678'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
  cooldown: 3,

  async execute({ message, args }) {
    const targetId = message.reference?.messageId || msgId(args[0]);
    if (!targetId) return info(message, 'Reply to a message or use `pin <messageId>`.');

    const target = await message.channel.messages.fetch(targetId).catch(() => null);
    if (!target) return bad(message, 'Message not found.');
    if (target.pinned) return info(message, 'That message is already pinned.');

    await target.pin(`Pinned by ${message.author.tag}`);
    await modlog(message, 'pin', target.author?.id || null, 'Manual pin', {
      channelId: message.channel.id,
      messageId: target.id
    });

    return respond.reply(message, 'pin', `Pinned message: ${target.url}`);
  }
};