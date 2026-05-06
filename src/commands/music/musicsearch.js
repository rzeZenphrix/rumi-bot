const { requiredStringCommand } = require('../../systems/music/prefixShared');

module.exports = requiredStringCommand({
  name: 'musicsearch',
  aliases: ['msearch'],
  serviceCommand: 'search',
  description: 'Search the music service without starting playback.',
  usage: ['musicsearch <query>'],
  examples: ['musicsearch keshi limbo'],
  help: 'Use `musicsearch <query>` to browse results without queueing them.',
  optionsBuilder(query) { return { query }; }
});
