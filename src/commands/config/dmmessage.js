const { PermissionFlagsBits } = require('discord.js');
const messages = require('./messages');

module.exports = {
  name: 'dmmessage',
  aliases: ['joindm', 'welcomedm'],
  category: 'messages',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  description: 'Configure join direct messages.',
  usage: 'dmmessage <enable|disable|message|embed|preview>',
  examples: ['dmmessage enable', 'dmmessage message Welcome to {guild.name}!'],
  subcommands: messages.subcommands.filter((entry) => entry.name.startsWith('dm ')).map((entry) => ({
    ...entry,
    name: entry.name.replace(/^dm\s+/, ''),
    parent: 'dmmessage',
    usage: entry.usage.replace(/^dm\s+/, 'dmmessage ')
  })),
  typing: true,

  execute({ message, args }) {
    return messages.executeArea({ message, args, area: 'dm' });
  }
};
