const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
module.exports = { name: Events.GuildEmojiDelete || 'emojiDelete', async execute(_client, emoji) { await sendLog(emoji.guild, 'emojiDelete', { title: 'Emoji deleted', description: `Emoji **${emoji.name}** was deleted.`, targetId: emoji.id, fields: [{ name: 'Name', value: `\`${emoji.name}\``, inline: true }, { name: 'ID', value: `\`${emoji.id}\``, inline: true }], thumbnail: emoji.imageURL() }); } };
