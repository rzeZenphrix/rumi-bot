const { PermissionFlagsBits } = require('discord.js');
const purge = require('../staff/purge');
const { ok, info } = require('../../utils/moderationSimple');
const { requireUserPremium } = require('../../systems/monetization/access');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: 'selfpurge',
  aliases: ['mypurge', 'purgeself'],
  category: 'moderation',
  description: 'Delete your own recent messages.',
  usage: 'selfpurge [filters] [amount]',
  examples: ['selfpurge 25', 'selfpurge links 50'],
  guildOnly: true,
  botPermissions: [PermissionFlagsBits.ManageMessages, PermissionFlagsBits.ReadMessageHistory],
  cooldown: 8,
  premium: { scope: 'user', tier: 'base' },

  async execute({ message, args }) {
    const premium = await requireUserPremium(message, 'Self purge');
    if (!premium) return null;

    const { filters, limit } = purge.parsePurgeArgs([...args]);
    filters.push({ type: 'self' });

    const selected = (await purge.collectMessages(message.channel, filters, limit, message.author.id))
      .filter((msg) => msg.id !== message.id);

    if (!selected.length) return info(message, 'No matching messages found.');

    let deleted = 0;
    for (let i = 0; i < selected.length; i += 100) {
      const result = await message.channel.bulkDelete(selected.slice(i, i + 100), true).catch(() => null);
      deleted += result?.size || 0;
    }

    await message.delete().catch(() => null);

    await sendLog(message.guild, 'moderationAction', {
      title: 'Self purge',
      actorId: message.author.id,
      channelId: message.channel.id,
      description: `${message.author} self-purged ${deleted} message(s).`
    }).catch(() => null);

    return ok(message, `Deleted ${deleted} of your messages.`);
  }
};