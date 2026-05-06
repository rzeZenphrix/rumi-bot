const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('musicpanel', 'panel', 'Post the interactive music control panel.', ["musicpanel"], ["musicpanel"], {
  aliases: ['mpanel'],
  title: 'Music Panel'
});
