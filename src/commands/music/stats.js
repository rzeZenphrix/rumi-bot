const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('stats', 'stats', 'Show playback, node, and queue stats from the music service.', ["stats"], ["stats"], {
  title: 'Music Stats'
});
