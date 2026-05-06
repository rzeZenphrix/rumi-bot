const respond = require('../../utils/respond');
const link = require('./actions/link');
const unlink = require('./actions/unlink');
const profile = require('./actions/profile');
const nowplaying = require('./actions/nowplaying');
const recent = require('./actions/recent');
const toptracks = require('./actions/toptracks');
const topartists = require('./actions/topartists');
const playlists = require('./actions/playlists');
const track = require('./actions/track');
const artist = require('./actions/artist');
const album = require('./actions/album');
const compare = require('./actions/compare');
const status = require('./actions/status');

const ACTIONS = [
  link,
  unlink,
  profile,
  nowplaying,
  recent,
  toptracks,
  topartists,
  playlists,
  track,
  artist,
  album,
  compare,
  status
];

const ACTION_MAP = new Map();
for (const action of ACTIONS) {
  ACTION_MAP.set(action.id, action);
  for (const alias of action.aliases || []) {
    ACTION_MAP.set(alias, action);
  }
}

const LEGACY_HINTS = {
  play: 'Use `play <query>` for playback, or `spotify track <query>` to search Spotify.',
  pause: 'Use `pause` for playback control.',
  resume: 'Use `resume` for playback control.',
  skip: 'Use `skip` for playback control.',
  queue: 'Use `queue` for playback control.',
  device: 'Playback device controls are handled by the music sidecar for now.',
  resolve: 'Paste a Spotify URL into `spotify track`, `spotify album`, or `spotify artist` to resolve it.',
  playlist: 'Use `spotify playlists` to browse linked playlists or `spotify track <query>` to search.'
};

module.exports = {
  name: 'spotify',
  aliases: ['spoti'],
  category: 'music',
  description: 'Link Spotify to Rumi and use rich profile, playback history, library, and search commands.',
  usage: 'spotify <link|unlink|status|profile|nowplaying|recent|toptracks|topartists|playlists|track|artist|album|compare> ...',
  examples: [
    'spotify link',
    'spotify profile',
    'spotify nowplaying',
    'spotify toptracks short',
    'spotify compare @Rumi',
    'spotify track pink pony club'
  ],
  slash: true,
  subcommands: ACTIONS.map((action) => ({
    name: action.id,
    aliases: action.aliases || [],
    description: action.description,
    usage: action.usage,
    examples: action.examples
  })),
  async execute(context) {
    const args = [...(context.args || [])];
    const subcommand = String(args.shift() || '').trim().toLowerCase();

    if (!subcommand) {
      return respond.reply(context.message, 'info', 'Use `spotify link`, `spotify profile`, `spotify nowplaying`, `spotify toptracks`, or `spotify track <query>`.', {
        mentionUser: false
      });
    }

    if (LEGACY_HINTS[subcommand]) {
      return respond.reply(context.message, 'info', LEGACY_HINTS[subcommand], { mentionUser: false });
    }

    const action = ACTION_MAP.get(subcommand);
    if (action) {
      return action.run({ ...context, args });
    }

    return track.run({ ...context, args: [subcommand, ...args] });
  }
};
