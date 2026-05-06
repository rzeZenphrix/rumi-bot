const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('pause', 'pause', 'Pause music playback.', ["pause"], ["pause"], {
  title: 'Pause'
});
