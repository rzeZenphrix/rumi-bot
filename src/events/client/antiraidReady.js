const { Events } = require('discord.js');
const { snapshotInvites } = require('../../systems/antiraid/inviteTracker');
const { startRaidModeExpiryWatcher } = require('../../systems/antiraid/raidMode');
const logger = require('../../systems/logging/logger');

module.exports = {
  name: Events.ClientReady,
  once: true,

  async execute(client) {
    for (const guild of client.guilds.cache.values()) {
      await snapshotInvites(guild).catch((error) => {
        logger.warn(
          {
            error,
            guildId: guild.id
          },
          'Anti-raid invite snapshot failed on ready'
        );
      });
    }

    startRaidModeExpiryWatcher(client);

    logger.info(
      {
        guilds: client.guilds.cache.size
      },
      'Anti-raid invite snapshots and raid-mode expiry watcher initialized'
    );
  }
};