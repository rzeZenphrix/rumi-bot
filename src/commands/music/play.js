const { requiredStringCommand } = require('../../systems/music/prefixShared');

module.exports = requiredStringCommand({
  name: 'play',
  serviceCommand: 'play',
  description: 'Play a song, playlist, or search result in your current voice channel.',
  usage: ['play <query>'],
  examples: ['play pink pony club'],
  help: 'Use `play <query>` to start playback.',
  optionsBuilder(query) { return { query }; }
});
