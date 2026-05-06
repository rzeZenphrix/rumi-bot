const { requiredStringCommand } = require('../../systems/music/prefixShared');

module.exports = requiredStringCommand({
  name: 'musicimport',
  aliases: ['mimport'],
  serviceCommand: 'import',
  description: 'Import a queue from an export code.',
  usage: ['musicimport <code>'],
  examples: ['musicimport abc123'],
  help: 'Use `musicimport <code>` with a queue export code.',
  optionsBuilder(data) { return { data }; }
});
