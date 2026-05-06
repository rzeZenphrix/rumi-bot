const respond = require('../../utils/respond');
const musicService = require('../../services/musicService');
const { isMusicReady, MUSIC_NOT_READY } = require('../runtime/featureGates');

const FILTER_MODES = [
  'off',
  'clear',
  'bassboost',
  'nightcore',
  'vaporwave',
  'karaoke',
  'tremolo',
  'vibrato',
  'rotation',
  'lowpass'
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
  if (!payload) {
    return fallback;
  }

  if (payload.detail) {
    return `${payload.error || fallback}\n${payload.detail}`;
  }

  return payload.error || fallback;
}

function toEmbedOptions(payload, fallbackTitle) {
  return {
    mentionUser: false,
    title: payload.title || fallbackTitle || 'Music',
    description: payload.description || 'The music service returned an empty response.',
    fields: Array.isArray(payload.fields) ? payload.fields : [],
    thumbnail: payload.thumbnail || null,
    footer: payload.footer ? { text: payload.footer } : undefined,
    color: Number.isFinite(Number(payload.color)) ? Number(payload.color) : undefined
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
  return FILTER_MODES.includes(normalized) ? normalized : normalized;
}

function joinArgs(args = []) {
  return args.join(' ').trim();
}

function overviewEmbed() {
  return {
    title: 'Music Commands',
    description: 'You can use these directly now, so you do not need to type `music <command>` unless you want the legacy format.',
    fields: LEGACY_OVERVIEW.map(([name, lines]) => ({
      name,
      value: lines.map((line) => `\`${line}\``).join('\n'),
      inline: false
    })),
    color: 0x7c9cff,
    footer: {
      text: 'Short direct commands are live. Collision-prone ones stay music-prefixed.'
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
        return respond.reply(message, 'info', spec.help || `Use \`${Array.isArray(spec.usage) ? spec.usage[0] : spec.usage}\`.`);
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

  if (['queue', 'nowplaying', 'skip', 'pause', 'resume', 'stop', 'leave', 'shuffle', 'history', 'stats', 'lyrics', 'panel', 'export', 'clear'].includes(command)) {
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
    return mode ? { command: mode === 'clear' ? 'filter.off' : `filter.${mode}`, options: {} } : null;
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
        return respond.reply(message, 'info', 'Use a direct command like `play`, `queue`, `musicsearch`, or `musicsettings`, or stick with `music <command>`.', overviewEmbed());
      }

      return runMusic(message, parsed.command, parsed.options || {}, 'Music');
    }
  };
}

module.exports = {
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
