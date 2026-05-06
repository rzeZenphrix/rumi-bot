const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('resume', 'resume', 'Resume paused playback.', ["resume"], ["resume"], {
  aliases: ['unpause'],
  title: 'Resume'
});
