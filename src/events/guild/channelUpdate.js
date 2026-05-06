const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { diffField, compactFields } = require('../../utils/logFields');
const { recordVersionSnapshot } = require('../../systems/serverdata/backups');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { overwriteChanged } = require('../../systems/antinuke/permissionDiff');

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

    const overwritesChanged = overwriteChanged(oldChannel, newChannel);

    if (fields.length > 1 || overwritesChanged) {
      await recordVersionSnapshot(newChannel.guild, `Channel updated: ${newChannel.name}`, 'channel_update').catch(() => null);

      await sendLog(newChannel.guild, 'channelUpdate', {
        title: 'Channel updated',
        description: `${newChannel} was updated.`,
        channelId: newChannel.id,
        fields: [
          ...fields,
          overwritesChanged
            ? { name: 'Permission overwrites', value: 'Changed', inline: true }
            : null
        ].filter(Boolean)
      });
    }

    if (fields.length > 1 || overwritesChanged) {
      await handleAntiNukeEvent({
        guild: newChannel.guild,
        actionType: 'channel_update',
        targetId: newChannel.id,
        target: newChannel,
        oldValue: oldChannel,
        newValue: newChannel,
        metadata: {
          targetType: 'channel',
          targetName: newChannel.name,
          overwritesChanged
        }
      }).catch(() => null);
    }
  }
};