const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildEmojiUpdate || 'emojiUpdate',

  async execute(_client, oldEmoji, newEmoji) {
    if (oldEmoji.name === newEmoji.name) return;

    await sendLog(newEmoji.guild, 'emojiUpdate', {
      title: 'Emoji updated',
      description: `Emoji **${oldEmoji.name}** was updated.`,
      targetId: newEmoji.id,
      fields: [
        { name: 'Name', value: `Before: \`${oldEmoji.name}\`\nAfter: \`${newEmoji.name}\``, inline: false }
      ]
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: newEmoji.guild,
      actionType: 'emoji_update',
      targetId: newEmoji.id,
      target: newEmoji,
      oldValue: oldEmoji,
      newValue: newEmoji,
      metadata: {
        targetType: 'emoji',
        targetName: newEmoji.name
      }
    }).catch(() => null);
  }
};