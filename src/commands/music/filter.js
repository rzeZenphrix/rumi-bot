const { createMusicCommand, normalizeFilterMode, FILTER_MODES } = require('../../systems/music/prefixShared');

module.exports = createMusicCommand({
  name: 'filter',
  description: 'Apply a playback filter or clear the current one.',
  usage: ['filter <mode>'],
  examples: ['filter vaporwave', 'filter nightcore', 'filter off'],
  help: 'Use `filter <mode>`. Common modes: ' + FILTER_MODES.map((mode) => `\`${mode}\``).join(', ') + '.',
  async build(args) {
    const mode = normalizeFilterMode(args.shift());
    if (!mode) return null;
    return { command: mode === 'clear' ? 'filter.off' : `filter.${mode}`, options: {} };
  }
});
