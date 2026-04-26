const respond = require('../../utils/respond');

module.exports = {
  name: 'rolecount',
  aliases: ["rolescount"],
  category: 'server',
  description: "Shows server role count.",
  usage: "rolecount",
  examples: ["rolecount"],

  async execute({ message, args }) {
    return respond.reply(message, 'info', `found **${message.guild.roles.cache.size}** roles in this server.`);
  }
};
