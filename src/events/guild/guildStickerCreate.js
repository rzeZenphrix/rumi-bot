const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildStickerCreate || 'stickerCreate',

  async execute(_client, sticker) {
    await sendLog(sticker.guild, 'stickerCreate', {
      title: 'Sticker created',
      description: `Sticker **${sticker.name}** was created.`,
      targetId: sticker.id,
      fields: [
        { name: 'Name', value: `\`${sticker.name}\``, inline: true },
        { name: 'ID', value: `\`${sticker.id}\``, inline: true }
      ]
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: sticker.guild,
      actionType: 'sticker_create',
      targetId: sticker.id,
      target: sticker,
      newValue: sticker,
      metadata: {
        targetType: 'sticker',
        targetName: sticker.name
      }
    }).catch(() => null);
  }
};