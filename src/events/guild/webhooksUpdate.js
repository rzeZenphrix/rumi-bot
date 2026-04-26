const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
module.exports = { name: Events.WebhooksUpdate || 'webhooksUpdate', async execute(_client, channel) { if (!channel.guild) return; await sendLog(channel.guild, 'webhookUpdate', { title: 'Webhooks updated', description: `Webhooks were changed in ${channel}.`, channelId: channel.id, fields: [{ name: 'Channel name', value: `\`${channel.name || 'unknown'}\``, inline: true }] }); } };
