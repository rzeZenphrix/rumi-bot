const { PermissionFlagsBits } = require('discord.js');
const messages = require('./messages');

module.exports = {
  name: 'pingmessage',
  aliases: ['joinping', 'pingmessages'],
  category: 'messages',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  description: 'Configure join ping messages.',
  usage: 'pingmessage <enable|disable|add|remove|list|delete delay>',
  examples: ['pingmessage enable', 'pingmessage add @Announcements', 'pingmessage delete delay 10'],
  subcommands: messages.subcommands.filter((entry) => entry.name.startsWith('ping ')).map((entry) => ({
    ...entry,
    name: entry.name.replace(/^ping\s+/, ''),
    parent: 'pingmessage',
    usage: entry.usage.replace(/^ping\s+/, 'pingmessage ')
  })),
  typing: true,

  execute({ message, args }) {
    return messages.executeArea({ message, args, area: 'ping' });
  }
};
