const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: Events.MessageBulkDelete || 'messageDeleteBulk',
  async execute(_client, messages) {
    const first = messages.first?.();
    if (!first?.guild) return;

    await sendLog(first.guild, 'messageBulkDelete', {
      title: 'Messages bulk deleted',
      description: `**${messages.size}** messages were deleted in <#${first.channelId}>.`,
      channelId: first.channelId,
      fields: [
        { name: 'Count', value: String(messages.size), inline: true },
        { name: 'Newest deleted ID', value: `\`${first.id}\``, inline: true }
      ]
    });
  }
};
