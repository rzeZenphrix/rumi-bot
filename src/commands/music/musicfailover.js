const { simpleCommand } = require('../../systems/music/prefixShared');

module.exports = simpleCommand('musicfailover', 'node.failover', 'Force the music service to fail over to another node when available.', ["musicfailover"], ["musicfailover"], {
  title: 'Node Failover'
});
