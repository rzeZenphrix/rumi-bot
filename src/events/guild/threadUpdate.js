const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { diffField, compactFields } = require('../../utils/logFields');
module.exports = { name: Events.ThreadUpdate || 'threadUpdate', async execute(_client, oldThread, newThread) { if (!newThread.guild) return; const fields = compactFields([diffField('Name', oldThread.name, newThread.name), diffField('Archived', oldThread.archived, newThread.archived), diffField('Locked', oldThread.locked, newThread.locked), { name: 'Thread ID', value: `\`${newThread.id}\``, inline: true }]); if (fields.length <= 1) return; await sendLog(newThread.guild, 'threadUpdate', { title: 'Thread updated', description: `${newThread} was updated.`, channelId: newThread.id, fields }); } };
