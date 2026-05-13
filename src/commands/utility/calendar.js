const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { parseNaturalDate } = require('../../utils/naturalDate');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');
const {
  renderCalendarCard,
  attachment,
  hasCanvas
} = require('../../utils/socialCanvas');
const { friendlyId, matchesFriendlyId } = require('../../utils/friendlyIds');

function splitQueryAndPage(args) {
  const parts = [...args];
  const last = parts.at(-1);
  const page = /^\d+$/.test(String(last || '')) ? Math.max(1, Number(parts.pop())) : 1;
  return { page, text: parts.join(' ').trim() };
}

function timestamp(date) {
  return Math.floor(new Date(date).getTime() / 1000);
}

async function resolveCalendarId(userId, input) {
  const rows = await db.listCalendarEvents(userId, { limit: 100, offset: 0, includePast: true }).catch(() => []);
  return rows.find((row) => matchesFriendlyId(row.id, input, 'cal'))?.id || input;
}

async function sendCalendarList(message, rows, page) {
  const buffer = await renderCalendarCard(message.author, rows, page).catch(() => null);
  const file = attachment(buffer, 'rumi-calendar.png');

  if (file) {
    return message.channel.send({
      files: [file],
      allowedMentions: { parse: [] }
    });
  }

  const lines = rows.map((row, index) => {
    const number = index + 1 + (page - 1) * 5;
    return `${number}. **${row.title}**\n<t:${timestamp(row.starts_at)}:F>\n\`${friendlyId(row.id, 'cal')}\``;
  });

  return respond.reply(message, 'info', null, {
    title: `Upcoming events • Page ${page}`,
    allowTitle: true,
    mentionUser: false,
    description: lines.length
      ? lines.join('\n\n')
      : [
          'I could not find upcoming events for you.',
          '',
          hasCanvas() ? '' : '`Install @napi-rs/canvas to enable premium calendar cards.`'
        ].filter(Boolean).join('\n')
  });
}

module.exports = {
  name: 'calendar',
  aliases: ['calender', 'event'],
  category: 'utility',
  description: 'Save, view, and delete calendar events with friendly date parsing.',
  usage: 'calendar <create|list|delete> ...',
  examples: [
    'calendar create tomorrow 5pm Team meeting',
    'calendar create next Friday at 8 Demo',
    'calendar list',
    'calendar list 2',
    'calendar delete <id>'
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
      description: 'Create a new calendar event.',
      usage: 'calendar create <time> <title>',
      examples: ['calendar create tomorrow 5pm Team meeting', 'calendar create in 2 hours Study']
    },
    {
      name: 'list',
      description: 'Show your upcoming calendar events.',
      usage: 'calendar list [page]',
      examples: ['calendar list', 'calendar list 2']
    },
    {
      name: 'delete',
      aliases: ['remove'],
      description: 'Delete a calendar event by id.',
      usage: 'calendar delete <id>',
      examples: ['calendar delete 123']
    }
  ],

  async execute({ message, args, prefix }) {
    const sub = String(args.shift() || 'list').toLowerCase();
    const commandPrefix = prefix || message.prefix || ',';

    if (sub === 'create' || sub === 'add') {
      const access = await getPremiumAccessForMessage(message).catch(() => null);
      const limit = access?.limits?.calendarSlots || 75;

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
            'Free users can save up to 75 calendar events. User premium removes that limit.',
            { mentionUser: false }
          );
        }
      }

      let parsed = null;
      let title = '';

      for (let i = 1; i <= Math.min(args.length, 6); i += 1) {
        const candidate = args.slice(0, i).join(' ');
        const maybe = parseNaturalDate(candidate);

        if (maybe) {
          parsed = maybe;
          title = args.slice(i).join(' ').trim();
        }
      }

      if (!parsed || !title) {
        return respond.reply(
          message,
          'info',
          `Use \`${commandPrefix}calendar create <time> <title>\`. Examples: \`tomorrow 5pm\`, \`next Friday\`, \`in 2 hours\`.`,
          { mentionUser: false }
        );
      }

      if (parsed.ambiguous) {
        return respond.reply(
          message,
          'bad',
          'That date is a bit ambiguous. Include a time like `tomorrow 5pm` or `Monday at 9`.',
          { mentionUser: false }
        );
      }

      if (parsed.date.getTime() <= Date.now()) {
        return respond.reply(message, 'bad', 'That event time is in the past.', {
          mentionUser: false
        });
      }

      const row = await db.addCalendarEvent({
        user_id: message.author.id,
        guild_id: message.guild?.id || null,
        title: title.slice(0, 120),
        starts_at: parsed.date.toISOString(),
        channel_id: message.channel.id
      }).catch(() => null);

      if (!row) {
        return respond.reply(
          message,
          'bad',
          'I could not save that event because the database is currently unreachable.',
          { mentionUser: false }
        );
      }

      await respond.reply(
        message,
        'good',
        `I saved **${row.title || title.slice(0, 120)}** for <t:${Math.floor(parsed.date.getTime() / 1000)}:F>.`,
        { mentionUser: false }
      );

      return sendCalendarList(message, [row], 1);
    }

    if (sub === 'list') {
      const { page } = splitQueryAndPage(args);
      const perPage = 5;

      const rows = await db.listCalendarEvents(message.author.id, {
        limit: perPage,
        offset: (page - 1) * perPage
      }).catch(() => null);

      if (!rows) {
        return respond.reply(
          message,
          'bad',
          'I could not load your calendar because the database is currently unreachable.',
          { mentionUser: false }
        );
      }

      return sendCalendarList(message, rows, page);
    }

    if (sub === 'delete' || sub === 'remove') {
      const id = args.shift();

      if (!id) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}calendar delete <id>\`.`, {
          mentionUser: false
        });
      }

      const removed = await db.deleteCalendarEvent(message.author.id, await resolveCalendarId(message.author.id, id)).catch(() => null);

      if (!removed) {
        return respond.reply(message, 'bad', 'I could not delete that calendar event.', {
          mentionUser: false
        });
      }

      return respond.reply(message, 'good', 'I deleted that calendar event.', {
        mentionUser: false
      });
    }

    return respond.reply(message, 'info', `Use \`${commandPrefix}calendar <create|list|delete>\`.`, {
      mentionUser: false
    });
  }
};
