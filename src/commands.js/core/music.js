const respond = require('../../utils/respond');
const musicService = require('../../services/musicService');
const { isMusicReady, MUSIC_NOT_READY } = require('../../systems/runtime/featureGates');

function parseMusicCommand(args) {
  const command = String(args.shift() || 'status').toLowerCase();

  if (command === 'status') return { command: 'status', options: {} };
  if (command === 'play' || command === 'search') return { command, options: { query: args.join(' ') } };
  if (['queue', 'nowplaying', 'skip', 'pause', 'resume', 'stop', 'leave', 'shuffle', 'history', 'stats', 'lyrics', 'panel', 'export', 'clear'].includes(command)) {
    return { command, options: {} };
  }
  if (command === 'volume') return { command, options: { value: args[0] || '' } };
  if (command === 'seek') return { command, options: { position: args[0] || '' } };
  if (command === 'skipto' || command === 'remove') return { command, options: { index: args[0] || '' } };
  if (command === 'move') return { command, options: { from: args[0] || '', to: args[1] || '' } };
  if (command === 'autoplay') return { command, options: { enabled: args[0] || '' } };
  if (command === 'import') return { command, options: { data: args.join(' ') } };

  if (command === 'loop') {
    const mode = String(args.shift() || 'off').toLowerCase();
    return { command: `loop.${mode}`, options: {} };
  }

  if (command === 'filter') {
    const mode = String(args.shift() || '').toLowerCase();
    return { command: mode ? `filter.${mode}` : 'filter', options: {} };
  }

  if (command === 'settings') {
    const key = String(args.shift() || '').toLowerCase();
    if (!key) return { command: 'settings', options: {} };
    if (key === 'volume') return { command: 'settings.volume', options: { value: args[0] || '' } };
    if (key === 'autoplay' || key === 'announce') return { command: `settings.${key}`, options: { enabled: args[0] || '' } };
    if (key === 'djrole') return { command: 'settings.djrole', options: { role: args.join(' ') } };
    if (key === 'idle') return { command: 'settings.idle', options: { seconds: args[0] || '' } };
    if (key === 'restrict') return { command: 'settings.restrict', options: { mode: args[0] || '' } };
  }

  if (command === 'node' && String(args[0] || '').toLowerCase() === 'failover') {
    return { command: 'node.failover', options: {} };
  }

  return { command: null, options: {} };
}

function buildOptions(message, parsed) {
  const options = {
    ...parsed.options,
    userId: message.author.id,
    textChannelId: message.channel.id
  };

  const voiceChannel = message.member?.voice?.channel;
  if (voiceChannel) {
    options.voiceChannelId = voiceChannel.id;
  }

  return options;
}

function failureText(payload) {
  if (!payload) {
    return 'I could not reach the embedded music service right now.';
  }

  if (payload.detail) {
    return `${payload.error || 'Music is unavailable right now.'}\n${payload.detail}`;
  }

  return payload.error || 'I could not reach the embedded music service right now.';
}

module.exports = {
  name: 'music',
  aliases: ['musicstatus'],
  category: 'core',
  description: 'Control the separate Rumi music service from prefix commands.',
  usage: 'music [status|play|queue|skip|pause|resume|stop|leave|volume|seek|loop|shuffle|remove|move|clear|history|stats|lyrics|autoplay|filter|panel|export|import|settings]',
  examples: ['music', 'music play pink pony club', 'music queue', 'music loop track', 'music settings volume 80'],
  guildOnly: true,

  async execute({ message, args }) {
    const parsed = parseMusicCommand([...args]);
    if (!parsed.command || parsed.options.query === '') {
      return respond.reply(message, 'info', 'Use `music play <query>`, `music queue`, `music skip`, `music panel`, or `music settings ...`.');
    }

    if (!isMusicReady()) {
      return respond.reply(message, 'info', MUSIC_NOT_READY);
    }

    const payload = parsed.command === 'status'
      ? await musicService.getState(message.guild.id)
      : await musicService.runCommand(message.guild.id, parsed.command, buildOptions(message, parsed));

    if (!payload?.ok) {
      return respond.reply(message, 'bad', failureText(payload));
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: payload.title || 'Music',
      description: payload.description || 'The music service returned an empty response.',
      fields: Array.isArray(payload.fields) ? payload.fields : [],
      thumbnail: payload.thumbnail || null,
      footer: payload.footer ? { text: payload.footer } : undefined,
      color: Number.isFinite(Number(payload.color)) ? Number(payload.color) : undefined
    });
  }
};
