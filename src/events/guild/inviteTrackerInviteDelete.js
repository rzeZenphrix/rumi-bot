const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'inviteDelete',

  async execute(client, invite) {
    await inviteTracker.trackInviteDelete(invite).catch(() => null);
  }
};