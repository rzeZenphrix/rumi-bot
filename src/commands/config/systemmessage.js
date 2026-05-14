const { PermissionFlagsBits } = require('discord.js');
const messages = require('./messages');

module.exports = {
  name: 'systemmessage',
  aliases: ['systemmessages', 'invokemessage', 'invokemessages'],
  category: 'messages',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  description: 'Configure invoke and system response messages.',
  usage: 'systemmessage <enable|disable|channel|dm toggle|ban message|kick message|warn message|timeout message|role add message|role remove message|staff strip message|role receive message|role lost message|preview>',
  examples: ['systemmessage enable', 'systemmessage ban message {user.mention} was banned.', 'systemmessage preview ban'],
  subcommands: messages.subcommands.filter((entry) => entry.name.startsWith('system ')).map((entry) => ({
    ...entry,
    name: entry.name.replace(/^system\s+/, ''),
    parent: 'systemmessage',
    usage: entry.usage.replace(/^system\s+/, 'systemmessage ')
  })),
  typing: true,

  execute({ message, args, rawArgsInput }) {
    return messages.executeArea({ message, args, area: 'system', rawAreaInput: rawArgsInput });
  }
};
