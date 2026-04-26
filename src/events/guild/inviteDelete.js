const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
module.exports = { name: Events.InviteDelete || 'inviteDelete', async execute(_client, invite) { await sendLog(invite.guild, 'inviteDelete', { title: 'Invite deleted', description: `Invite \`${invite.code}\` was deleted.`, channelId: invite.channelId, fields: [{ name: 'Code', value: `\`${invite.code}\``, inline: true }] }); } };
