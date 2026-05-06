const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('queue', 'queue', 'Show the current queue for this server.', ["queue"], ["queue"], {
  title: 'Queue'
});
