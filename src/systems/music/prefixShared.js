const respond = require('../../utils/respond');
const musicService = require('../../services/musicService');
const { isMusicReady, MUSIC_NOT_READY } = require('../runtime/featureGates');

let recordMusicPlay = async () => null;
try {
  ({ recordMusicPlay } = require('./musicExtras'));
} catch (_error) {
  recordMusicPlay = async () => null;
}

const MUSIC_COLORS = {
  default: respond.DEFAULT_EMBED_COLOR,
  panel: respond.DEFAULT_EMBED_COLOR,
  success: respond.DEFAULT_EMBED_COLOR,
  warn: respond.DEFAULT_EMBED_COLOR,
  error: respond.ERROR_EMBED_COLOR
};

const FILTER_MODES = [
  'off',
  'clear',
  'bassboost',
  'bassboost_low',
  'bassboost_high',
  'nightcore',
  'vaporwave',
  'lofi',
  '8d',
  'rotation',
  'karaoke',
  'tremolo',
  'vibrato',
  'phaser',
  'subboost',
  'treble',
  'normalizer',
  'normalizer2',
  'surrounding',
  'pulsator',
  'mono',
  'reverse',
  'flanger',
  'chorus',
  'compressor'
];

const LOOP_MODES = ['off', 'track', 'queue'];
const TOGGLE_MODES = ['on', 'off'];

const SETTINGS_HELP = [
  'musicsettings',
  'musicsettings volume 80',
  'musicsettings autoplay on',
  'musicsettings announce off',
  'musicsettings djrole @dj',
  'musicsettings idle 180',
  'musicsettings restrict dj'
];

const LEGACY_OVERVIEW = [
  ['Playback', ['play <query>', 'queue', 'nowplaying', 'skip', 'pause', 'resume', 'stop', 'leave']],
  ['Queue tools', ['remove <index>', 'move <from> <to>', 'skipto <index>', 'clear', 'shuffle', 'musichistory']],
  ['Tuning', ['volume <value>', 'seek <position>', 'loop <off|track|queue>', 'filter <mode>', 'autoplay <on|off>']],
  ['Utilities', ['lyrics', 'stats', 'musicpanel', 'musicexport', 'musicimport <code>', 'musicsettings ...']],
  ['Extras', ['247 <on|off>', 'playlist', 'radio <station>', 'vibe <preset>', 'musicprofile']],
  ['Fallbacks', ['music play <query>', 'music queue', 'musicsettings volume 80']]
];

function buildMusicOptions(message, extra = {}) {
  const options = {
    ...extra,
    userId: message.author.id,
    textChannelId: message.channel.id
  };

  const voiceChannel = message.member?.voice?.channel;
  if (voiceChannel) {
    options.voiceChannelId = voiceChannel.id;
  }

  return options;
}

function failureText(payload, fallback = 'I could not reach the music service right now.') {
  if (!payload) return fallback;

  if (payload.detail) {
    return `${payload.error || fallback}\n${payload.detail}`;
  }

  return payload.error || fallback;
}

function normalizeColor(value, fallback = MUSIC_COLORS.default) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeFooter(footer) {
  if (!footer) return undefined;

  if (typeof footer === 'string') {
    const text = footer.trim();
    return text ? { text: text.slice(0, 2048) } : undefined;
  }

  if (typeof footer === 'object') {
    const text = String(footer.text || footer.footerText || '').trim();
    const iconURL = footer.iconURL || footer.icon_url || footer.iconUrl || undefined;

    if (!text) return undefined;

    return {
      text: text.slice(0, 2048),
      ...(iconURL ? { iconURL } : {})
    };
  }

  return undefined;
}

function normalizeThumbnail(thumbnail) {
  if (!thumbnail) return null;
  if (typeof thumbnail === 'string') return thumbnail;
  if (typeof thumbnail === 'object') return thumbnail.url || null;
  return null;
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field) => field && field.name !== undefined && field.value !== undefined)
    .slice(0, 25)
    .map((field) => ({
      name: String(field.name).slice(0, 256) || '\u200B',
      value: String(field.value).slice(0, 1024) || '\u200B',
      inline: Boolean(field.inline)
    }));
}

function toEmbedOptions(payload = {}, fallbackTitle = 'Music') {
  return {
    mentionUser: false,
    allowTitle: false,
    title: payload.title || fallbackTitle,
    description: payload.description || 'The music service returned an empty response.',
    fields: normalizeFields(payload.fields),
    thumbnail: normalizeThumbnail(payload.thumbnail),
    footer: normalizeFooter(payload.footer),
    color: normalizeColor(payload.color),
    components: payload.components || []
  };
}

async function replyPayload(message, payload, fallbackTitle) {
  return respond.reply(message, 'info', null, toEmbedOptions(payload, fallbackTitle));
}

function normalizeBooleanLike(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return TOGGLE_MODES.includes(normalized) ? normalized : '';
}

function normalizeLoopMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return LOOP_MODES.includes(normalized) ? normalized : '';
}

function normalizeFilterMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'rotate' || normalized === 'rotation') return '8d';
  if (normalized === 'clear') return 'off';
  return FILTER_MODES.includes(normalized) ? normalized : normalized;
}

function joinArgs(args = []) {
  return args.join(' ').trim();
}

function overviewEmbed() {
  return {
    title: 'Rumi Music',
    description: [
      'Premium playback with clean controls, richer source matching, and a softer queue flow.',
      '',
      '`play <song or URL>`  Start music',
      '`queue`  View what is next',
      '`nowplaying`  Current track',
      '`skip`  Next song',
      '`pause` / `resume`  Playback control',
      '`musicsearch <query>`  Browse matches',
      '',
      'Spotify, SoundCloud, Apple Music, YouTube, direct audio, and playlists are supported where available.'
    ].join('\n'),
    color: MUSIC_COLORS.panel,
    footer: {
      text: 'Rumi music · sleek node backend'
    }
  };
}

async function ensureReady(message) {
  if (!isMusicReady()) {
    await respond.reply(message, 'info', MUSIC_NOT_READY);
    return false;
  }

  return true;
}

async function runMusic(message, serviceCommand, options = {}, fallbackTitle = 'Music') {
  if (!(await ensureReady(message))) return null;

  const payload = serviceCommand === 'status'
    ? await musicService.getState(message.guild.id)
    : await musicService.runCommand(message.guild.id, serviceCommand, buildMusicOptions(message, options));

  if (!payload?.ok) {
    await respond.reply(message, 'bad', failureText(payload));
    return null;
  }

  if (serviceCommand === 'play' && options.query) {
    await recordMusicPlay(message.guild.id, message.author.id, {
      type: 'play',
      query: options.query
    }).catch(() => null);
  }

  await replyPayload(message, payload, fallbackTitle);
  return payload;
}

function createMusicCommand(spec) {
  return {
    name: spec.name,
    aliases: spec.aliases || [],
    category: 'music',
    description: spec.description,
    usage: spec.usage,
    examples: spec.examples,
    guildOnly: true,
    typing: true,

    async execute({ message, args }) {
      const built = await spec.build(StringArray(args), message);

      if (built?.reply) {
        return built.reply();
      }

      if (!built || !built.command) {
        return respond.reply(
          message,
          'info',
          spec.help || `Use \`${Array.isArray(spec.usage) ? spec.usage[0] : spec.usage}\`.`
        );
      }

      return runMusic(message, built.command, built.options || {}, spec.title || spec.name);
    }
  };
}

function StringArray(args = []) {
  return Array.isArray(args) ? [...args] : [];
}

function simpleCommand(name, serviceCommand, description, usage, examples, options = {}) {
  return createMusicCommand({
    name,
    aliases: options.aliases || [],
    title: options.title || name,
    description,
    usage,
    examples,
    help: options.help,

    async build(args) {
      return {
        command: serviceCommand,
        options: options.optionsBuilder ? options.optionsBuilder(args) : {}
      };
    }
  });
}

function requiredStringCommand(spec) {
  return createMusicCommand({
    ...spec,

    async build(args) {
      const value = joinArgs(args);
      if (!value) return null;

      return {
        command: spec.serviceCommand,
        options: spec.optionsBuilder(value, args)
      };
    }
  });
}

function parseMusicSettings(args = []) {
  const key = String(args.shift() || '').toLowerCase();
  if (!key) return { command: 'settings', options: {} };

  if (key === 'volume') {
    const value = String(args.shift() || '').trim();
    return value ? { command: 'settings.volume', options: { value } } : null;
  }

  if (key === 'autoplay' || key === 'announce') {
    const enabled = normalizeBooleanLike(args.shift());
    return enabled ? { command: `settings.${key}`, options: { enabled } } : null;
  }

  if (key === 'djrole') {
    const role = joinArgs(args);
    return role ? { command: 'settings.djrole', options: { role } } : null;
  }

  if (key === 'idle') {
    const seconds = String(args.shift() || '').trim();
    return seconds ? { command: 'settings.idle', options: { seconds } } : null;
  }

  if (key === 'restrict') {
    const mode = String(args.shift() || '').trim();
    return mode ? { command: 'settings.restrict', options: { mode } } : null;
  }

  return null;
}

function parseLegacyMusic(args = []) {
  const command = String(args.shift() || 'status').toLowerCase();

  if (command === 'status') return { command: 'status', options: {} };

  if (command === 'play') {
    const query = joinArgs(args);
    return query ? { command: 'play', options: { query } } : null;
  }

  if (command === 'search') {
    const query = joinArgs(args);
    return query ? { command: 'search', options: { query } } : null;
  }

  if ([
    'queue',
    'nowplaying',
    'skip',
    'pause',
    'resume',
    'stop',
    'leave',
    'shuffle',
    'history',
    'stats',
    'lyrics',
    'panel',
    'export',
    'clear'
  ].includes(command)) {
    return { command, options: {} };
  }

  if (command === 'volume') {
    const value = String(args.shift() || '').trim();
    return value ? { command, options: { value } } : null;
  }

  if (command === 'seek') {
    const position = String(args.shift() || '').trim();
    return position ? { command, options: { position } } : null;
  }

  if (command === 'skipto' || command === 'remove') {
    const index = String(args.shift() || '').trim();
    return index ? { command, options: { index } } : null;
  }

  if (command === 'move') {
    const from = String(args.shift() || '').trim();
    const to = String(args.shift() || '').trim();
    return from && to ? { command, options: { from, to } } : null;
  }

  if (command === 'autoplay') {
    const enabled = normalizeBooleanLike(args.shift());
    return enabled ? { command, options: { enabled } } : null;
  }

  if (command === 'import') {
    const data = joinArgs(args);
    return data ? { command, options: { data } } : null;
  }

  if (command === 'loop') {
    const mode = normalizeLoopMode(args.shift());
    return mode ? { command: `loop.${mode}`, options: {} } : null;
  }

  if (command === 'filter') {
    const mode = normalizeFilterMode(args.shift());
    return mode ? { command: `filter.${mode}`, options: {} } : null;
  }

  if (command === 'settings') {
    return parseMusicSettings(args);
  }

  if (command === 'node' && String(args[0] || '').toLowerCase() === 'failover') {
    return { command: 'node.failover', options: {} };
  }

  return null;
}

function createMusicOverviewCommand() {
  return {
    name: 'music',
    aliases: ['musicstatus'],
    category: 'music',
    description: 'Show music status, get a direct command overview, or use the legacy `music <command>` format.',
    usage: ['music', 'music status', 'music play <query>', 'music settings volume 80'],
    examples: ['music', 'music play pink pony club', 'music queue', 'music settings volume 80'],
    guildOnly: true,
    typing: true,

    async execute({ message, args }) {
      if (!args.length) {
        return respond.reply(message, 'info', null, overviewEmbed());
      }

      const parsed = parseLegacyMusic(args);
      if (!parsed) {
        return respond.reply(
          message,
          'info',
          'Use a direct command like `play`, `queue`, `musicsearch`, or `musicsettings`, or stick with `music <command>`.',
          overviewEmbed()
        );
      }

      return runMusic(message, parsed.command, parsed.options || {}, 'Music');
    }
  };
}

module.exports = {
  MUSIC_COLORS,
  FILTER_MODES,
  LOOP_MODES,
  SETTINGS_HELP,
  createMusicCommand,
  createMusicOverviewCommand,
  failureText,
  normalizeBooleanLike,
  normalizeFilterMode,
  normalizeLoopMode,
  parseLegacyMusic,
  parseMusicSettings,
  requiredStringCommand,
  runMusic,
  simpleCommand
};
