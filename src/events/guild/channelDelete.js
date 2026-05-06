const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { recordVersionSnapshot } = require('../../systems/serverdata/backups');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.ChannelDelete || 'channelDelete',

  async execute(_client, channel) {
    if (!channel.guild) return;

    console.log('[CHANNEL DELETE LISTENER V2]', {
      guildId: channel.guild.id,
      channelId: channel.id,
      channelName: channel.name
    });

    await recordVersionSnapshot(
      channel.guild,
      `Channel deleted: ${channel.name}`,
      'channel_delete'
    ).catch(() => null);

    await sendLog(channel.guild, 'channelDelete', {
      title: 'Channel deleted',
      description: `Channel **${channel.name || channel.id}** was deleted.`,
      channelId: channel.id,
      fields: [
        {
          name: 'Name',
          value: `\`${channel.name || 'unknown'}\``,
          inline: true
        },
        {
          name: 'ID',
          value: `\`${channel.id}\``,
          inline: true
        }
      ]
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: channel.guild,
      actionType: 'channel_delete',
      targetId: channel.id,
      target: channel,
      oldValue: channel,
      metadata: {
        targetType: 'channel',
        targetName: channel.name
      }
    }).catch(() => null);
  }
};