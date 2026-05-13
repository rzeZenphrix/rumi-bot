const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'inviteCreate',

  async execute(client, invite) {
    await inviteTracker.trackInviteCreate(invite).catch(() => null);
  }
};