const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
module.exports = { name: Events.GuildEmojiCreate || 'emojiCreate', async execute(_client, emoji) { await sendLog(emoji.guild, 'emojiCreate', { title: 'Emoji created', description: `${emoji} **${emoji.name}** was created.`, targetId: emoji.id, fields: [{ name: 'Name', value: `\`${emoji.name}\``, inline: true }, { name: 'Animated', value: emoji.animated ? 'Yes' : 'No', inline: true }], thumbnail: emoji.url }); } };
