const respond = require('../../utils/respond');
const { requireSharedPremium } = require('../../systems/monetization/access');

const DISCORD_REGEXES = {
  user: {
    pattern: '<@!?(\\d{17,20})>',
    example: '<@123456789012345678>',
    description: 'Matches a Discord user mention and captures the user ID.'
  },
  role: {
    pattern: '<@&(\\d{17,20})>',
    example: '<@&123456789012345678>',
    description: 'Matches a Discord role mention and captures the role ID.'
  },
  channel: {
    pattern: '<#(\\d{17,20})>',
    example: '<#123456789012345678>',
    description: 'Matches a Discord channel mention and captures the channel ID.'
  },
  emoji: {
    pattern: '<(a?):([A-Za-z0-9_]{2,32}):(\\d{17,20})>',
    example: '<:rumi:123456789012345678>',
    description: 'Matches a custom emoji, including animated emoji.'
  },
  invite: {
    pattern: '(?:https?:\\/\\/)?(?:www\\.)?(?:discord\\.gg|discord(?:app)?\\.com\\/invite)\\/([A-Za-z0-9-]{2,32})',
    example: 'https://discord.gg/c7jRGDuecN',
    description: 'Matches a Discord invite link and captures the invite code.'
  },
  message: {
    pattern: 'https?:\\/\\/(?:canary\\.|ptb\\.)?discord(?:app)?\\.com\\/channels\\/(\\d{17,20}|@me)\\/(\\d{17,20})\\/(\\d{17,20})',
    example: 'https://discord.com/channels/111/222/333',
    description: 'Matches a Discord message link and captures guild, channel, and message IDs.'
  },
  timestamp: {
    pattern: '<t:(\\d{1,13})(?::([tTdDfFR]))?>',
    example: '<t:1714214400:F>',
    description: 'Matches a Discord timestamp tag and captures the unix time and style.'
  },
  webhook: {
    pattern: 'https:\\/\\/discord\\.com\\/api\\/webhooks\\/(\\d{17,20})\\/([A-Za-z0-9._-]+)',
    example: 'https://discord.com/api/webhooks/123/token',
    description: 'Matches a Discord webhook URL.'
  },
  snowflake: {
    pattern: '\\d{17,20}',
    example: '123456789012345678',
    description: 'Matches a Discord snowflake ID.'
  }
};

function listPatterns() {
  return Object.entries(DISCORD_REGEXES)
    .map(([name, item]) => `\`${name}\` - ${item.description}`)
    .join('\n');
}

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

function makeRegex(key) {
  const item = DISCORD_REGEXES[key];
  if (!item) return null;
  return new RegExp(item.pattern, 'g');
}

module.exports = {
  name: 'regex',
  aliases: ['discordregex', 'regexbuilder', 're'],
  category: 'utility',
  description: 'Generate ready-to-use Discord regex patterns for mentions, links, emoji, and more.',
  usage: 'regex <list|discord|test> [type] [sample]',
  examples: [
    'regex list',
    'regex discord emoji',
    'regex test emoji <:rumi:123456789012345678>'
  ],

  async execute({ message, args }) {
    const access = await requireSharedPremium(message, 'Regex builder').catch(() => null);
    if (!access) return null;

    const sub = normalizeKey(args.shift() || 'list');

    if (sub === 'list') {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Discord Regex Builder',
        description: 'Here are the Discord-ready regex templates I can generate for you.',
        fields: [
          { name: 'Available patterns', value: listPatterns() },
          { name: 'Usage', value: '`regex discord <type>`\n`regex test <type> <sample>`' }
        ]
      });
    }

    if (sub === 'discord' || sub === 'build') {
      const key = normalizeKey(args.shift());
      const item = DISCORD_REGEXES[key];

      if (!item) {
        return respond.reply(message, 'info', `Use \`regex discord <type>\`. Available types: ${Object.keys(DISCORD_REGEXES).map((name) => `\`${name}\``).join(', ')}.`);
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Discord Regex: ${key}`,
        fields: [
          { name: 'Pattern', value: `\`/${item.pattern}/g\`` },
          { name: 'What it does', value: item.description },
          { name: 'Example input', value: `\`${item.example}\`` }
        ]
      });
    }

    if (sub === 'test') {
      const key = normalizeKey(args.shift());
      const sample = args.join(' ').trim();
      const item = DISCORD_REGEXES[key];

      if (!item || !sample) {
        return respond.reply(message, 'info', 'Use `regex test <type> <sample>`.');
      }

      const regex = makeRegex(key);
      const matches = [...sample.matchAll(regex)];
      const first = matches[0] || null;

      return respond.reply(message, matches.length ? 'good' : 'bad', null, {
        mentionUser: false,
        title: `Discord Regex Test: ${key}`,
        fields: [
          { name: 'Pattern', value: `\`/${item.pattern}/g\`` },
          { name: 'Sample', value: `\`${sample.slice(0, 900)}\`` },
          { name: 'Matched', value: matches.length ? 'yes' : 'no', inline: true },
          { name: 'Match count', value: String(matches.length), inline: true },
          { name: 'First capture', value: first ? `\`${JSON.stringify(first.slice(1)).slice(0, 900)}\`` : 'none' }
        ]
      });
    }

    return respond.reply(message, 'info', 'Use `regex list`, `regex discord <type>`, or `regex test <type> <sample>`.');
  }
};
