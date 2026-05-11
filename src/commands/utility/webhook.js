const { PermissionFlagsBits, WebhookClient } = require('discord.js');
const respond = require('../../utils/respond');

function isWebhookUrl(value) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && /(^|\.)discord(?:app)?\.com$/i.test(url.hostname) && /\/api\/webhooks\/\d+\/[^/]+$/i.test(url.pathname);
  } catch {
    return false;
  }
}

function parseFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  const value = args[index + 1] || null;
  args.splice(index, value ? 2 : 1);
  return value;
}

module.exports = {
  name: 'webhook',
  aliases: ['hook'],
  category: 'utility',
  description: 'Send, edit, delete, inspect, or test Discord webhooks.',
  usage: 'webhook <send|edit|delete|info|test> ...',
  examples: ['webhook send <url> hello', 'webhook info <url>', 'webhook test <url>'],
  flags: [
    { name: '--name <text>', description: 'Override the sender name for webhook send.' },
    { name: '--avatar <url>', description: 'Override the sender avatar for webhook send.' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageWebhooks],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || '').toLowerCase();
    const url = args.shift();
    if (!['send', 'edit', 'delete', 'info', 'test'].includes(sub) || !url) {
      return respond.reply(message, 'info', 'Use `webhook <send|edit|delete|info|test> <webhookUrl> ...`.');
    }
    if (!isWebhookUrl(url)) return respond.reply(message, 'bad', 'I need a valid Discord webhook URL.');

    const webhook = new WebhookClient({ url });

    if (sub === 'info') {
      const data = await webhook.fetch().catch(() => null);
      if (!data) return respond.reply(message, 'bad', 'I could not fetch information for that webhook.');
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Webhook info',
        allowTitle: true,
        description: `**Name:** ${data.name || 'unknown'}\n**Channel:** <#${data.channelId}>\n**Server:** \`${data.guildId}\``
      });
    }

    if (sub === 'test') {
      const sent = await webhook.send({
        content: 'Rumi webhook test message.',
        allowedMentions: { parse: [] },
        username: 'Rumi'
      }).catch(() => null);
      if (!sent) return respond.reply(message, 'bad', 'I could not send a test message to that webhook.');
      return respond.reply(message, 'good', `Webhook test succeeded with message \`${sent.id}\`.`);
    }

    if (sub === 'send') {
      const username = parseFlag(args, '--name');
      const avatarURL = parseFlag(args, '--avatar');
      const content = args.join(' ').trim();
      if (!content) return respond.reply(message, 'info', 'Use `webhook send <url> <message> [--name Name] [--avatar Url]`.');
      const sent = await webhook.send({
        content,
        allowedMentions: { parse: [] },
        username: username || 'Rumi',
        avatarURL: avatarURL || undefined
      }).catch(() => null);
      if (!sent) return respond.reply(message, 'bad', 'I could not send that webhook message.');
      return respond.reply(message, 'good', `I sent that webhook message: \`${sent.id}\`.`);
    }

    if (sub === 'edit') {
      const messageId = args.shift();
      const content = args.join(' ').trim();
      if (!messageId || !content) return respond.reply(message, 'info', 'Use `webhook edit <url> <messageId> <message>`.');
      await webhook.editMessage(messageId, { content, allowedMentions: { parse: [] } }).catch(() => null);
      return respond.reply(message, 'good', 'I edited that webhook message.');
    }

    const messageId = args.shift();
    if (!messageId) return respond.reply(message, 'info', 'Use `webhook delete <url> <messageId>`.');
    await webhook.deleteMessage(messageId).catch(() => null);
    return respond.reply(message, 'good', 'I deleted that webhook message.');
  }
};
