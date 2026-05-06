const { createMusicCommand } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'volume',
  description: 'Set the playback volume.',
  usage: ['volume <value>'],
  examples: ['volume 80'],
  help: 'Use `volume <value>`, usually between 1 and 200.',
  title: 'Volume',
  async build(args) {
    const value = String(args.shift() || '').trim();
    if (!value) return null;
    return { command: 'volume', options: { value } };
  }
});
