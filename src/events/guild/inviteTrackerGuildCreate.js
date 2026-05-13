const inviteTracker = require('../../systems/invites/inviteTracker');

module.exports = {
  name: 'guildCreate',

  async execute(client, guild) {
    await inviteTracker.initGuild(guild).catch(() => null);
  }
};