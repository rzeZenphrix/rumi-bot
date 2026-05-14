const { PermissionFlagsBits } = require('discord.js');
const messages = require('./messages');

module.exports = {
  name: 'welcome',
  aliases: ['welcomemessage', 'joinmessage'],
  category: 'messages',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  description: 'Configure welcome messages.',
  usage: 'welcome <enable|disable|channel|message|embed|preview|delete delay>',
  examples: ['welcome enable', 'welcome channel #welcome', 'welcome message Welcome {user.mention} to {guild.name}!'],
  subcommands: messages.subcommands.filter((entry) => entry.name.startsWith('welcome ')).map((entry) => ({
    ...entry,
    name: entry.name.replace(/^welcome\s+/, ''),
    parent: 'welcome',
    usage: entry.usage.replace(/^welcome\s+/, 'welcome ')
  })),
  typing: true,

  execute({ message, args, rawArgsInput }) {
    return messages.executeArea({ message, args, area: 'welcome', rawAreaInput: rawArgsInput });
  }
};
