const { createMusicCommand } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'seek',
  description: 'Jump to a timestamp in the current track.',
  usage: ['seek <position>'],
  examples: ['seek 1:45', 'seek 95'],
  help: 'Use `seek <position>` with seconds or a timestamp like `1:45`.',
  title: 'Seek',
  async build(args) {
    const position = String(args.shift() || '').trim();
    if (!position) return null;
    return { command: 'seek', options: { position } };
  }
});
