const { createMusicCommand, normalizeBooleanLike } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'autoplay',
  description: 'Turn autoplay on or off.',
  usage: ['autoplay <on|off>'],
  examples: ['autoplay on', 'autoplay off'],
  help: 'Use `autoplay <on|off>`.',
  title: 'Autoplay',
  async build(args) {
    const enabled = normalizeBooleanLike(args.shift());
    if (!enabled) return null;
    return { command: 'autoplay', options: { enabled } };
  }
});