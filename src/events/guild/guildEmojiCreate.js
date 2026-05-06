const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildEmojiCreate || 'emojiCreate',

  async execute(_client, emoji) {
    await sendLog(emoji.guild, 'emojiCreate', {
      title: 'Emoji created',
      description: `Emoji **${emoji.name}** was created.`,
      targetId: emoji.id,
      fields: [
        { name: 'Name', value: `\`${emoji.name}\``, inline: true },
        { name: 'ID', value: `\`${emoji.id}\``, inline: true }
      ]
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: emoji.guild,
      actionType: 'emoji_create',
      targetId: emoji.id,
      target: emoji,
      newValue: emoji,
      metadata: {
        targetType: 'emoji',
        targetName: emoji.name
      }
    }).catch(() => null);
  }
};