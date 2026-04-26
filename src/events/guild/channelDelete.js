const { handleNukeAction, AuditLogEvent } = require('../../systems/antinuke/guard');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: 'channelDelete',
  async execute(_client, channel) {
    if (!channel.guild) return;

    await sendLog(channel.guild, 'channelDelete', {
      title: 'Channel deleted',
      description: `Channel **${channel.name || channel.id}** was deleted.`,
      channelId: channel.id,
      fields: [
        { name: 'Name', value: `\`${channel.name || 'unknown'}\``, inline: true },
        { name: 'Type', value: `\`${channel.type}\``, inline: true },
        { name: 'ID', value: `\`${channel.id}\``, inline: true }
      ]
    });

    await handleNukeAction(channel.guild, AuditLogEvent.ChannelDelete, 'channelDelete', channel.id);
  }
};
