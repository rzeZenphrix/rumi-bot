const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
module.exports = { name: Events.GuildEmojiUpdate || 'emojiUpdate', async execute(_client, oldEmoji, newEmoji) { if (oldEmoji.name === newEmoji.name) return; await sendLog(newEmoji.guild, 'emojiUpdate', { title: 'Emoji updated', description: `${newEmoji} was updated.`, targetId: newEmoji.id, fields: [{ name: 'Name', value: `Before: \`${oldEmoji.name}\`\nAfter: \`${newEmoji.name}\``, inline: false }], thumbnail: newEmoji.url }); } };
