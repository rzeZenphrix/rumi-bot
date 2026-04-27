const respond = require('../../utils/respond');
const db = require('../../services/database');
const { parseNaturalDate } = require('../../utils/naturalDate');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

function splitQueryAndPage(args) {
  const parts = [...args];
  const last = parts.at(-1);
  const page = /^\d+$/.test(String(last || '')) ? Math.max(1, Number(parts.pop())) : 1;
  return { page, text: parts.join(' ').trim() };
}

module.exports = {
  name: 'calendar',
  aliases: ['cal', 'event'],
  category: 'utility',
  description: 'I save calendar events in Supabase with friendlier date parsing.',
  usage: 'calendar <create|list|delete> ...',
  examples: ['calendar create tomorrow 5pm Team meeting', 'calendar create next Friday at 8 Demo', 'calendar list'],
  typing: true,

  async execute({ message, args }) {
    const sub = (args.shift() || 'list').toLowerCase();

    if (sub === 'create' || sub === 'add') {
      const access = await getPremiumAccessForMessage(message).catch(() => null);
      const limit = access?.limits?.calendarSlots || 20;
      if (Number.isFinite(limit)) {
        const existing = await db.listCalendarEvents(message.author.id, {
          limit: 100,
          offset: 0,
          includePast: true
        }).catch(() => null);
        if (existing && existing.length >= limit) {
          return respond.reply(
            message,
            'bad',
            'Free users can save up to 20 calendar events. User premium removes that limit.'
          );
        }
      }

      const raw = args.join(' ').trim();
      const parts = raw.split(/\s{2,}| \- /);
      let parsed = null;
      let title = '';

      for (let i = 1; i <= Math.min(args.length, 5); i += 1) {
        const candidate = args.slice(0, i).join(' ');
        const maybe = parseNaturalDate(candidate);
        if (maybe) {
          parsed = maybe;
          title = args.slice(i).join(' ').trim();
        }
      }

      if (!parsed || !title) {
        return respond.reply(message, 'info', 'Use `calendar create <time> <title>`. Examples: `tomorrow 5pm`, `next Friday`, `in 2 hours`.');
      }

      if (parsed.ambiguous) {
        return respond.reply(message, 'bad', 'That date is a bit ambiguous. Include a time like `tomorrow 5pm` or `Monday at 9`.');
      }

      if (parsed.date.getTime() <= Date.now()) {
        return respond.reply(message, 'bad', 'That event time is in the past.');
      }

      const row = await db.addCalendarEvent({
        user_id: message.author.id,
        guild_id: message.guild?.id || null,
        title: title.slice(0, 120),
        starts_at: parsed.date.toISOString(),
        channel_id: message.channel.id
      }).catch(() => null);

      if (!row) {
        return respond.reply(message, 'bad', 'I could not save that event because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `I saved that event for <t:${Math.floor(parsed.date.getTime() / 1000)}:F>.`);
    }

    if (sub === 'list') {
      const { page } = splitQueryAndPage(args);
      const perPage = 5;
      const rows = await db.listCalendarEvents(message.author.id, {
        limit: perPage,
        offset: (page - 1) * perPage
      }).catch(() => null);

      if (!rows) {
        return respond.reply(message, 'bad', 'I could not load your calendar because the database is currently unreachable.');
      }

      const lines = rows.map((row, index) => `${index + 1 + (page - 1) * perPage}. **${row.title}** - <t:${Math.floor(new Date(row.starts_at).getTime() / 1000)}:F>\n\`${row.id}\``);
      return respond.reply(message, 'info', lines.length ? `Upcoming events page ${page}:\n\n${lines.join('\n\n')}` : 'I could not find upcoming events for you.');
    }

    if (sub === 'delete' || sub === 'remove') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `calendar delete <id>`.');
      const removed = await db.deleteCalendarEvent(message.author.id, id).catch(() => null);
      if (!removed) return respond.reply(message, 'bad', 'I could not delete that calendar event.');
      return respond.reply(message, 'good', 'I deleted that calendar event.');
    }

    return respond.reply(message, 'info', 'Use `calendar create`, `calendar list`, or `calendar delete`.');
  }
};
