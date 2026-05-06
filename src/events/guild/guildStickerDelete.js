const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildStickerDelete || 'stickerDelete',

  async execute(_client, sticker) {
    await sendLog(sticker.guild, 'stickerDelete', {
      title: 'Sticker deleted',
      description: `Sticker **${sticker.name}** was deleted.`,
      targetId: sticker.id,
      fields: [
        { name: 'Name', value: `\`${sticker.name}\``, inline: true },
        { name: 'ID', value: `\`${sticker.id}\``, inline: true }
      ]
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: sticker.guild,
      actionType: 'sticker_delete',
      targetId: sticker.id,
      target: sticker,
      oldValue: sticker,
      metadata: {
        targetType: 'sticker',
        targetName: sticker.name
      }
    }).catch(() => null);
  }
};