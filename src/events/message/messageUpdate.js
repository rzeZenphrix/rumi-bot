const { Events } = require('discord.js');
const logger = require('../../systems/logging/logger');
const { addEditSnipe } = require('../../systems/snipe/snipeStore');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: Events.MessageUpdate,

  async execute(client, oldMessage, newMessage) {
    try {
      if (oldMessage.partial || newMessage.partial) return;
      if (!oldMessage.guild) return;
      if (oldMessage.author?.bot) return;
      if (oldMessage.content === newMessage.content) return;

      addEditSnipe(oldMessage, newMessage);

      await sendLog(oldMessage.guild, 'messageUpdate', {
        title: 'Message edited',
        description: `[Jump to message](${newMessage.url})`,
        userId: oldMessage.author?.id,
        channelId: oldMessage.channel?.id,
        fields: [
          { name: 'Before', value: oldMessage.content || '*No text content.*', inline: false },
          { name: 'After', value: newMessage.content || '*No text content.*', inline: false },
          { name: 'Message ID', value: `\`${oldMessage.id}\``, inline: true }
        ],
        thumbnail: oldMessage.author?.displayAvatarURL?.({ size: 256 })
      });
    } catch (error) {
      logger.error({ error, guildId: oldMessage.guild?.id, channelId: oldMessage.channel?.id }, 'Could not store edit snipe/log');
    }
  }
};
