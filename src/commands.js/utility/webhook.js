const { PermissionFlagsBits, WebhookClient } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'webhook',
  aliases: ['hook'],
  category: 'utility',
  description: 'I send, edit, or delete webhook messages.',
  usage: 'webhook <send|edit|delete> ...',
  examples: ['webhook send <url> hello', 'webhook delete <url> <messageId>'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageWebhooks],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();
    const url = args.shift();
    if (!['send', 'edit', 'delete'].includes(sub) || !url) return respond.reply(message, 'info', 'Use `webhook <send|edit|delete> <webhookUrl> ...`.');
    const webhook = new WebhookClient({ url });

    if (sub === 'send') {
      const content = args.join(' ').trim();
      if (!content) return respond.reply(message, 'info', 'Use `webhook send <url> <message>`.');
      const sent = await webhook.send({ content, allowedMentions: { parse: [] }, username: 'Rumi' });
      return respond.reply(message, 'good', `I sent that webhook message: \`${sent.id}\`.`);
    }

    if (sub === 'edit') {
      const messageId = args.shift();
      const content = args.join(' ').trim();
      if (!messageId || !content) return respond.reply(message, 'info', 'Use `webhook edit <url> <messageId> <message>`.');
      await webhook.editMessage(messageId, { content, allowedMentions: { parse: [] } });
      return respond.reply(message, 'good', 'I edited that webhook message.');
    }

    const messageId = args.shift();
    if (!messageId) return respond.reply(message, 'info', 'Use `webhook delete <url> <messageId>`.');
    await webhook.deleteMessage(messageId);
    return respond.reply(message, 'good', 'I deleted that webhook message.');
  }
};
