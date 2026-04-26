const respond = require('../../utils/respond');
const db = require('../../services/database');

function parseDate(input) {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? null : date;
}

module.exports = {
  name: 'calendar',
  aliases: ['cal', 'event'],
  category: 'utility',
  description: 'I save simple calendar events in Supabase.',
  usage: 'calendar <create|list|delete> ...',
  examples: ['calendar create 2026-05-01T10:00:00 Team meeting', 'calendar list'],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'create' || sub === 'add') {
      const dateRaw = args.shift();
      const date = parseDate(dateRaw);
      const title = args.join(' ').trim();
      if (!date || !title) return respond.reply(message, 'info', 'Use `calendar create <YYYY-MM-DDTHH:mm:ss> <title>`.');
      const row = await db.addCalendarEvent({ user_id: message.author.id, guild_id: message.guild?.id || null, title, starts_at: date.toISOString(), channel_id: message.channel.id });
      return respond.reply(message, 'good', `I saved that calendar event: \`${row.id}\`.`);
    }

    if (sub === 'list') {
      const rows = await db.listCalendarEvents(message.author.id);
      const lines = rows.map((row, index) => `${index + 1}. **${row.title}** — <t:${Math.floor(new Date(row.starts_at).getTime() / 1000)}:F>\n\`${row.id}\``);
      return respond.reply(message, 'info', lines.length ? `I found your upcoming events:\n${lines.join('\n')}` : 'I could not find upcoming events for you.');
    }

    if (sub === 'delete' || sub === 'remove') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `calendar delete <id>`.');
      await db.deleteCalendarEvent(message.author.id, id);
      return respond.reply(message, 'good', 'I deleted that calendar event.');
    }

    return respond.reply(message, 'info', 'Use `calendar create`, `calendar list`, or `calendar delete`.');
  }
};
