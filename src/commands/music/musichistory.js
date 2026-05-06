const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('musichistory', 'history', 'Show recently played tracks.', ["musichistory"], ["musichistory"], {
  aliases: ['mhistory'],
  title: 'History'
});
