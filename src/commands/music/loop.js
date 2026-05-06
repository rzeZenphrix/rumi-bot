const { createMusicCommand, normalizeLoopMode, LOOP_MODES } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'loop',
  description: 'Set loop mode for the current track or queue.',
  usage: ['loop <off|track|queue>'],
  examples: ['loop track', 'loop queue', 'loop off'],
  help: 'Use `loop <mode>` where mode is one of: ' + LOOP_MODES.map((mode) => `\`${mode}\``).join(', ') + '.',
  title: 'Loop',
  async build(args) {
    const mode = normalizeLoopMode(args.shift());
    if (!mode) return null;
    return { command: `loop.${mode}`, options: {} };
  }
});
