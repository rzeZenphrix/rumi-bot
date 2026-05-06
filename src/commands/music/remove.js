const { createMusicCommand } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'remove',
  description: 'Remove one track from the queue.',
  usage: ['remove <index>'],
  examples: ['remove 4'],
  help: 'Use `remove <index>` to drop one queue entry.',
  title: 'Remove',
  async build(args) {
    const index = String(args.shift() || '').trim();
    if (!index) return null;
    return { command: 'remove', options: { index } };
  }
});
