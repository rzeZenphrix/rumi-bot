const { PermissionFlagsBits } = require('discord.js');
const messages = require('./messages');

module.exports = {
  name: 'goodbye',
  aliases: ['leavemessage', 'goodbyemessage', 'farewell'],
  category: 'messages',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  description: 'Configure goodbye messages.',
  usage: 'goodbye <enable|disable|channel|message|embed|preview|delete delay>',
  examples: ['goodbye enable', 'goodbye channel #goodbye', 'goodbye message {user.tag} left the server.'],
  subcommands: messages.subcommands.filter((entry) => entry.name.startsWith('leave ')).map((entry) => ({
    ...entry,
    name: entry.name.replace(/^leave\s+/, ''),
    parent: 'goodbye',
    usage: entry.usage.replace(/^leave\s+/, 'goodbye ')
  })),
  typing: true,

  execute({ message, args, rawArgsInput }) {
    return messages.executeArea({ message, args, area: 'leave', rawAreaInput: rawArgsInput });
  }
};
