const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildStickerUpdate || 'stickerUpdate',

  async execute(_client, oldSticker, newSticker) {
    const changed = oldSticker.name !== newSticker.name ||
      oldSticker.description !== newSticker.description ||
      oldSticker.tags !== newSticker.tags;

    if (!changed) return;

    await sendLog(newSticker.guild, 'stickerUpdate', {
      title: 'Sticker updated',
      description: `Sticker **${newSticker.name}** was updated.`,
      targetId: newSticker.id,
      fields: [
        { name: 'Name', value: `Before: \`${oldSticker.name}\`\nAfter: \`${newSticker.name}\``, inline: false },
        { name: 'Tags', value: `Before: \`${oldSticker.tags || 'none'}\`\nAfter: \`${newSticker.tags || 'none'}\``, inline: false }
      ]
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: newSticker.guild,
      actionType: 'sticker_update',
      targetId: newSticker.id,
      target: newSticker,
      oldValue: oldSticker,
      newValue: newSticker,
      metadata: {
        targetType: 'sticker',
        targetName: newSticker.name
      }
    }).catch(() => null);
  }
};