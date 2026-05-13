const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { applyVerificationToNewChannel } = require('../../systems/verification/verificationManager');
const { logEventError } = require('../../utils/discordErrors');

module.exports = {
  name: Events.ChannelCreate || 'channelCreate',

  async execute(_client, channel) {
    if (!channel.guild) return;

    await sendLog(channel.guild, 'channelCreate', {
      title: 'Channel created',
      description: `${channel} was created.`,
      channelId: channel.id,
      fields: [
        { name: 'Name', value: `\`${channel.name || 'unknown'}\``, inline: true },
        { name: 'ID', value: `\`${channel.id}\``, inline: true }
      ]
    });

    await applyVerificationToNewChannel(channel).catch((error) => {
      logEventError({ eventName: 'verificationChannelCreate', guildId: channel.guild.id, channelId: channel.id }, error).catch(() => null);
    });

    await handleAntiNukeEvent({
      guild : channel.guild,
      actionType: 'something_create',
      targetId: channel.id,
      target: channel,
      newValue: channel,
      metadata: {
        targetType: 'channel',
        targetName: channel.name
      }
    }).catch(() => null);
  }
};
