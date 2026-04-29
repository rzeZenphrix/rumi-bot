const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { diffField, compactFields } = require('../../utils/logFields');
const { recordVersionSnapshot } = require('../../systems/serverdata/backups');

module.exports = {
  name: Events.ChannelUpdate || 'channelUpdate',
  async execute(_client, oldChannel, newChannel) {
    if (!newChannel.guild) return;

    const fields = compactFields([
      diffField('Name', oldChannel.name, newChannel.name),
      diffField('Topic', oldChannel.topic, newChannel.topic, false),
      diffField('NSFW', oldChannel.nsfw, newChannel.nsfw),
      diffField('Rate limit', oldChannel.rateLimitPerUser, newChannel.rateLimitPerUser),
      { name: 'Channel ID', value: `\`${newChannel.id}\``, inline: true }
    ]);

    if (fields.length <= 1) return;

    await recordVersionSnapshot(newChannel.guild, `Channel updated: ${newChannel.name}`, 'channel_update').catch(() => null);
    await sendLog(newChannel.guild, 'channelUpdate', {
      title: 'Channel updated',
      description: `${newChannel} was updated.`,
      channelId: newChannel.id,
      fields
    });
  }
};
