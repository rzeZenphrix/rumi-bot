const respond = require('../../utils/respond');

module.exports = {
  name: 'permissions',
  aliases: ["perms"],
  category: 'server',
  description: "Shows a member permissions summary.",
  usage: "permissions [user]",
  examples: ["permissions [user]"],

  async execute({ message, args }) {
    const member = message.mentions.members.first() || message.member;
    const perms = member.permissions.toArray().map(p => p.replace(/([a-z])([A-Z])/g, '$1 $2')).slice(0, 40);
    return respond.reply(message, 'info', null, {
      description: `I found permissions for ${member}.`,
      fields: [{ name: 'Permissions', value: perms.join(', ').slice(0, 1024) || 'None' }]
    });
  }
};
