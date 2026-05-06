const respond = require('../../utils/respond');
const link = require('./actions/link');
const unlink = require('./actions/unlink');
const profile = require('./actions/profile');
const nowplaying = require('./actions/nowplaying');
const recent = require('./actions/recent');
const toptracks = require('./actions/toptracks');
const topartists = require('./actions/topartists');
const topalbums = require('./actions/topalbums');
const loved = require('./actions/loved');
const collage = require('./actions/collage');
const compare = require('./actions/compare');
const lastfmClient = require('../../services/lastfm/client');

const ACTIONS = [
  link,
  unlink,
  profile,
  nowplaying,
  recent,
  toptracks,
  topartists,
  topalbums,
  loved,
  collage,
  compare
];

const ACTION_MAP = new Map();
for (const action of ACTIONS) {
  ACTION_MAP.set(action.id, action);
  for (const alias of action.aliases || []) {
    ACTION_MAP.set(alias, action);
  }
}

module.exports = {
  name: 'lastfm',
  aliases: ['lfm', 'fm'],
  category: 'music',
  description: 'Link Last.fm to Rumi and use rich scrobble, chart, comparison, and profile commands.',
  usage: 'lastfm <link|unlink|profile|nowplaying|recent|toptracks|topartists|topalbums|loved|collage|compare> ...',
  examples: [
    'lastfm link',
    'lastfm profile',
    'lastfm nowplaying',
    'lastfm topartists overall',
    'lastfm collage 1month',
    'lastfm compare @Rumi'
  ],
  slash: true,
  subcommands: [
    ...ACTIONS.map((action) => ({
      name: action.id,
      aliases: action.aliases || [],
      description: action.description,
      usage: action.usage,
      examples: action.examples
    })),
    {
      name: 'top',
      aliases: ['chart', 'charts'],
      description: 'Compatibility wrapper for Last.fm chart lookups.',
      usage: 'lastfm top <artists|albums|tracks> [period] [@user|username]',
      examples: ['lastfm top artists 7day']
    }
  ],
  async execute(context) {
    const args = [...(context.args || [])];
    const subcommand = String(args.shift() || '').trim().toLowerCase();

    if (!subcommand) {
      if (!lastfmClient.isConfigured()) {
        return respond.reply(context.message, 'bad', 'Last.fm needs `LASTFM_API_KEY` in your environment.');
      }
      return nowplaying.run({ ...context, args: [] });
    }

    if (!['link', 'unlink', 'remove', 'set', 'unset'].includes(subcommand) && !lastfmClient.isConfigured()) {
      return respond.reply(context.message, 'bad', 'Last.fm needs `LASTFM_API_KEY` in your environment.');
    }

    if (subcommand === 'set') {
      return link.run({ ...context, args: [] });
    }
    if (['unset', 'remove'].includes(subcommand)) {
      return unlink.run({ ...context, args: [] });
    }
    if (['top', 'chart', 'charts'].includes(subcommand)) {
      const type = String(args.shift() || 'tracks').trim().toLowerCase();
      if (type.startsWith('artist')) return topartists.run({ ...context, args });
      if (type.startsWith('album')) return topalbums.run({ ...context, args });
      return toptracks.run({ ...context, args });
    }

    const action = ACTION_MAP.get(subcommand);
    if (action) {
      return action.run({ ...context, args });
    }

    return nowplaying.run({ ...context, args: [subcommand, ...args] });
  }
};
