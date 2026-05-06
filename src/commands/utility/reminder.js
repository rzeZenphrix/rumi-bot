const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { requireUserPremium } = require('../../systems/monetization/access');
const {
  renderReminderCard,
  attachment,
  hasCanvas
} = require('../../utils/socialCanvas');

function parseMinutes(input) {
  const match = String(input || '').match(/^(\d+)(m|h|d)?$/i);

  if (!match) return null;

  const n = Number(match[1]);
  const unit = (match[2] || 'm').toLowerCase();

  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'm') return n;
  if (unit === 'h') return n * 60;
  if (unit === 'd') return n * 1440;

  return null;
}

async function sendReminderCard(message, text, runAt) {
  const buffer = await renderReminderCard(message.author, { text, runAt }).catch(() => null);
  const file = attachment(buffer, 'rumi-reminder.png');

  if (file) {
    return message.channel.send({
      files: [file],
      allowedMentions: { parse: [] }
    });
  }

  return respond.reply(message, 'good', null, {
    title: 'Reminder saved',
    allowTitle: true,
    mentionUser: false,
    description: [
      `**Reminder**\n${text}`,
      '',
      `Runs <t:${Math.floor(new Date(runAt).getTime() / 1000)}:R>`,
      hasCanvas() ? '' : '`Install @napi-rs/canvas to enable premium reminder cards.`'
    ].filter(Boolean).join('\n')
  });
}

module.exports = {
  name: 'reminder',
  aliases: ['remind', 'remindme'],
  category: 'utility',
  description: 'Save premium reminders as scheduled tasks.',
  usage: 'reminder <time> <message>',
  examples: [
    'reminder 10m check logs',
    'reminder 2h drink water',
    'reminder 1d renew subscription'
  ],
  slash: true,
  typing: true,
  botPermissions: [
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.EmbedLinks
  ],
  subcommands: [
    {
      name: 'create',
      aliases: ['add'],
      description: 'Create a reminder.',
      usage: 'reminder <10m|2h|1d> <message>',
      examples: ['reminder 10m check logs', 'reminder 2h drink water'],
      premium: { scope: 'user', tier: 'base' }
    }
  ],

  async execute({ message, args, prefix }) {
    const commandPrefix = prefix || message.prefix || ',';

    const maybeSub = String(args[0] || '').toLowerCase();
    if (maybeSub === 'create' || maybeSub === 'add') args.shift();

    const access = await requireUserPremium(message, 'Reminders').catch(() => null);
    if (!access) return null;

    const minutes = parseMinutes(args.shift());
    const text = args.join(' ').trim();

    if (!minutes || !text) {
      return respond.reply(message, 'info', `Use \`${commandPrefix}reminder <10m|2h|1d> <message>\`.`, {
        mentionUser: false
      });
    }

    const runAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();

    const row = await db.createScheduledTask({
      guild_id: message.guild?.id || null,
      user_id: message.author.id,
      channel_id: message.channel.id,
      task_type: 'reminder',
      run_at: runAt,
      payload: { text }
    }).catch(() => null);

    if (!row) {
      return respond.reply(message, 'bad', 'I could not save that reminder right now.', {
        mentionUser: false
      });
    }

    await respond.reply(
      message,
      'good',
      `I saved that reminder for <t:${Math.floor(new Date(runAt).getTime() / 1000)}:R>.`,
      { mentionUser: false }
    );

    return sendReminderCard(message, text, runAt);
  }
};