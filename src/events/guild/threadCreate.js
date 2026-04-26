const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
module.exports = { name: Events.ThreadCreate || 'threadCreate', async execute(_client, thread) { if (!thread.guild) return; await sendLog(thread.guild, 'threadCreate', { title: 'Thread created', description: `${thread} was created.`, channelId: thread.id, fields: [{ name: 'Name', value: `\`${thread.name}\``, inline: true }, { name: 'Parent', value: thread.parentId ? `<#${thread.parentId}>` : 'None', inline: true }] }); } };
