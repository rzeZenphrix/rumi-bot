const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
module.exports = { name: Events.ThreadDelete || 'threadDelete', async execute(_client, thread) { if (!thread.guild) return; await sendLog(thread.guild, 'threadDelete', { title: 'Thread deleted', description: `Thread **${thread.name}** was deleted.`, channelId: thread.id, fields: [{ name: 'Name', value: `\`${thread.name}\``, inline: true }, { name: 'Parent', value: thread.parentId ? `<#${thread.parentId}>` : 'None', inline: true }] }); } };
