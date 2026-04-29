const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { logModerationAction } = require('../../systems/logging/auditLog');

function extractMessageId(input) {
  const raw = String(input || '');
  return raw.match(/\/(\d{17,20})$/)?.[1] || raw.match(/^(\d{17,20})$/)?.[1] || null;
}

module.exports = {
  name: 'unpin',
  aliases: ['unpinmsg'],
  category: 'moderation',
  description: 'Unpin a message in the current channel.',
  usage: 'unpin [messageId|messageLink]',
  examples: ['unpin', 'unpin 123456789012345678', 'unpin https://discord.com/channels/...'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageMessages],
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
  cooldown: 3,

  async execute({ message, args }) {
    const repliedId = message.reference?.messageId || null;
    const targetId = repliedId || extractMessageId(args[0]);

    if (!targetId) {
      return respond.reply(message, 'info', 'Reply to a pinned message or use `unpin <messageId|messageLink>`.');
    }

    const target = await message.channel.messages.fetch(targetId).catch(() => null);
    if (!target) {
      return respond.reply(message, 'bad', 'I could not find that message in this channel.');
    }

    if (!target.pinned) {
      return respond.reply(message, 'info', 'That message is not pinned.');
    }

    await target.unpin(`Unpinned by ${message.author.tag}`).catch(() => null);
    const refreshed = await message.channel.messages.fetch(targetId).catch(() => null);
    if (refreshed?.pinned) {
      return respond.reply(message, 'bad', 'I could not unpin that message. Check my permissions and try again.');
    }

    await logModerationAction({
      guildId: message.guild.id,
      userId: target.author?.id || null,
      moderatorId: message.author.id,
      actionType: 'unpin',
      reason: 'Manual unpin',
      metadata: {
        channelId: message.channel.id,
        messageId: target.id,
      },
    });

    return respond.reply(message, 'good', `I unpinned [this message](${target.url}).`);
  },
};
