const respond = require('../../utils/respond');
const db = require('../../services/database');
const { requireUserPremium } = require('../../systems/monetization/access');

function parseMinutes(input) {
  const match = String(input || '').match(/^(\d+)(m|h|d)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  const unit = (match[2] || 'm').toLowerCase();
  if (unit === 'm') return n;
  if (unit === 'h') return n * 60;
  if (unit === 'd') return n * 1440;
  return null;
}

module.exports = {
  name: 'reminder',
  aliases: ['remind', 'remindme'],
  category: 'utility',
  description: 'I save reminders as scheduled tasks in Supabase.',
  usage: 'reminder <time> <message>',
  examples: ['reminder 10m check logs', 'reminder 2h drink water'],
  typing: true,

  async execute({ message, args }) {
    const access = await requireUserPremium(message, 'Reminders').catch(() => null);
    if (!access) return null;

    const minutes = parseMinutes(args.shift());
    const text = args.join(' ').trim();
    if (!minutes || !text) return respond.reply(message, 'info', 'Use `reminder <10m|2h|1d> <message>`.');
    const runAt = new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const row = await db.createScheduledTask({
      guild_id: message.guild?.id || null,
      user_id: message.author.id,
      channel_id: message.channel.id,
      task_type: 'reminder',
      run_at: runAt,
      payload: { text }
    });
    return respond.reply(message, 'good', `I saved that reminder for <t:${Math.floor(new Date(runAt).getTime() / 1000)}:R>.`);
  }
};
