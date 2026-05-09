const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('leave', 'leave', 'Disconnect Rumi from the voice channel.', ["leave"], ["leave"], {
  aliases: ['dc'],
  title: 'Leave'
});
