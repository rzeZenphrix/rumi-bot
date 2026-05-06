const { createMusicCommand } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'move',
  description: 'Move a track to a different queue position.',
  usage: ['move <from> <to>'],
  examples: ['move 5 2'],
  help: 'Use `move <from> <to>` to reorder the queue.',
  title: 'Move',
  async build(args) {
    const from = String(args.shift() || '').trim();
    const to = String(args.shift() || '').trim();
    if (!from || !to) return null;
    return { command: 'move', options: { from, to } };
  }
});
