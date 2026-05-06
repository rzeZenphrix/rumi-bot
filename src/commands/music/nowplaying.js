const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('nowplaying', 'nowplaying', 'Show the track currently playing.', ["nowplaying"], ["nowplaying"], {
  aliases: ['np'],
  title: 'Now Playing'
});
