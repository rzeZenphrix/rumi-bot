const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildEmojiDelete || 'emojiDelete',

  async execute(_client, emoji) {
    await sendLog(emoji.guild, 'emojiDelete', {
      title: 'Emoji deleted',
      description: `Emoji **${emoji.name}** was deleted.`,
      targetId: emoji.id,
      fields: [
        { name: 'Name', value: `\`${emoji.name}\``, inline: true },
        { name: 'ID', value: `\`${emoji.id}\``, inline: true }
      ]
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: emoji.guild,
      actionType: 'emoji_delete',
      targetId: emoji.id,
      target: emoji,
      oldValue: emoji,
      metadata: {
        targetType: 'emoji',
        targetName: emoji.name
      }
    }).catch(() => null);
  }
};