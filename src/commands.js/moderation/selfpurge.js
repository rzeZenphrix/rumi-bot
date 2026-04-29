const { AttachmentBuilder, PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const purge = require('./purge');
const { requireUserPremium } = require('../../systems/monetization/access');
const { sendLog } = require('../../systems/logging/logDispatcher');
const logger = require('../../systems/logging/logger');

module.exports = {
  name: 'selfpurge',
  aliases: ['mypurge', 'purgeself'],
  category: 'moderation',
  description: 'Delete your own recent messages with the same filters as purge.',
  usage: 'selfpurge [messages|links|embeds|attachments|stickers|emojis|contains <keyword>|before <id>|after <id>|mentions] <amount|all>',
  examples: ['selfpurge 25', 'selfpurge links 50', 'selfpurge contains spoiler 30'],
  guildOnly: true,
  typing: true,
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
  cooldown: 8,
  premium: { scope: 'user', tier: 'base' },

  async execute({ message, args }) {
    const premium = await requireUserPremium(message, 'Self purge');
    if (!premium) return null;

    const { filters, limit } = purge.parsePurgeArgs([...args]);
    filters.push({ type: 'self' });

    const selected = (await purge.collectMessages(message.channel, filters, limit, message.author.id))
      .filter((entry) => entry.id !== message.id);

    if (!selected.length) {
      return respond.reply(message, 'info', 'I found no matching messages from the last 14 days.', { mentionUser: false });
    }

    const transcript = purge.buildTranscript(selected, {
      guildName: message.guild.name,
      guildId: message.guild.id,
      channelName: message.channel.name,
      channelId: message.channel.id,
      moderatorTag: `${message.author.tag} (selfpurge)`,
      moderatorId: message.author.id
    });

    const archivedFiles = await purge.collectAttachmentFiles(selected).catch((error) => {
      logger.warn({ error, guildId: message.guild.id, channelId: message.channel.id }, 'Self purge attachment archiving failed');
      return [];
    });

    const files = [
      new AttachmentBuilder(transcript, {
        name: `selfpurge-${message.channel.id}-${Date.now()}.txt`
      }),
      ...archivedFiles
    ];

    let deleted = 0;
    for (let index = 0; index < selected.length; index += 100) {
      const chunk = selected.slice(index, index + 100);
      const result = await message.channel.bulkDelete(chunk, true).catch(() => null);
      deleted += result?.size || 0;
    }

    const removedCommand = await message.delete().then(() => 1).catch(() => 0);
    deleted += removedCommand;

    await sendLog(message.guild, 'moderationAction', {
      title: 'Self purge',
      actorId: message.author.id,
      channelId: message.channel.id,
      description: `${message.author} self-purged ${deleted} message(s) in ${message.channel}.`,
      fields: [
        { name: 'Selected', value: String(selected.length), inline: true },
        { name: 'Deleted', value: String(deleted), inline: true }
      ],
      files
    }).catch(() => null);

    return respond.reply(
      message,
      'good',
      `Deleted **${deleted}** of your recent message(s).`,
      { useWebhook: false }
    );
  }
};
