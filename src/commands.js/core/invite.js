const { PermissionsBitField } = require('discord.js');
const respond = require('../../utils/respond');
module.exports = {
  name: 'invite', aliases: ['addbot'], category: 'core',
  description: 'I generate my bot invite link.', usage: 'invite', examples: ['invite'],
  async execute({ client, message }) {
    const clientId = process.env.DISCORD_CLIENT_ID || client.user?.id;
    const perms = new PermissionsBitField(['Administrator']).bitfield.toString();
    const url = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${perms}&scope=bot%20applications.commands`;
    return respond.reply(message, 'info', null, { description: `🔗 **Invite me**\n[Click here to invite me](${url}).` });
  }
};
