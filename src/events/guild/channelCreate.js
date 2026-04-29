const { Events } = require('discord.js');
const logger = require('../../systems/logging/logger');
const { protectNewChannel } = require('../../systems/jail/setupManager');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { recordVersionSnapshot } = require('../../systems/serverdata/backups');

module.exports = {
  name: Events.ChannelCreate,

  async execute(client, channel) {
    try {
      await protectNewChannel(channel);
    } catch (error) {
      logger.error({ error, guildId: channel.guild?.id, channelId: channel.id }, 'Could not protect new channel for jail role');
    }

    if (!channel.guild) return;
    await recordVersionSnapshot(channel.guild, `Channel created: ${channel.name}`, 'channel_create').catch(() => null);

    await sendLog(channel.guild, 'channelCreate', {
      title: 'Channel created',
      description: `${channel} was created.`,
      channelId: channel.id,
      fields: [
        { name: 'Name', value: `\`${channel.name || 'unknown'}\``, inline: true },
        { name: 'Type', value: `\`${channel.type}\``, inline: true },
        { name: 'ID', value: `\`${channel.id}\``, inline: true }
      ]
    });
  }
};
