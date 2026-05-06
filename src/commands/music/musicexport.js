const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('musicexport', 'export', 'Export the current queue into a reusable code.', ["musicexport"], ["musicexport"], {
  aliases: ['mexport'],
  title: 'Export Queue'
});
