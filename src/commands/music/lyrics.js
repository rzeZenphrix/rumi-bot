const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('lyrics', 'lyrics', 'Show lyrics for the current track when available.', ["lyrics"], ["lyrics"], {
  title: 'Lyrics'
});
