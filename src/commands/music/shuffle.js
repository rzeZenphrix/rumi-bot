const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('shuffle', 'shuffle', 'Shuffle the current queue.', ["shuffle"], ["shuffle"], {
  title: 'Shuffle'
});
