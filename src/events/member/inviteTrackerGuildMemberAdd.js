const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'guildMemberAdd',

  async execute(client, member) {
    await inviteTracker.trackMemberJoin(member).catch(() => null);
  }
};