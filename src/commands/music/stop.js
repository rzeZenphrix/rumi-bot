const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('stop', 'stop', 'Stop playback and clear the queue.', ["stop"], ["stop"], {
  title: 'Stop'
});
