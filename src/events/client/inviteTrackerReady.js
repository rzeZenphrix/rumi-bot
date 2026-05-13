const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'clientReady',
  once: true,

  async execute(client) {
    await inviteTracker.initClient(client);
  }
};