const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('skip', 'skip', 'Skip the current track.', ["skip"], ["skip"], {
  title: 'Skip'
});
