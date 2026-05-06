const { createMusicCommand } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'skipto',
  description: 'Skip directly to a specific queue index.',
  usage: ['skipto <index>'],
  examples: ['skipto 5'],
  help: 'Use `skipto <index>` to jump straight to a queued track.',
  title: 'Skip To',
  async build(args) {
    const index = String(args.shift() || '').trim();
    if (!index) return null;
    return { command: 'skipto', options: { index } };
  }
});
