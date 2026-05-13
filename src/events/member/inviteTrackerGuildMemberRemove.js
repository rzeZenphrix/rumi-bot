const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'guildMemberRemove',

  async execute(client, member) {
    await inviteTracker.trackMemberLeave(member).catch(() => null);
  }
};