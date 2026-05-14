const { PermissionFlagsBits } = require('discord.js');
const messages = require('./messages');

module.exports = {
  name: 'sticky',
  aliases: ['stickymessage', 'stickymsg'],
  category: 'messages',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  description: 'Configure sticky channel messages.',
  usage: 'sticky <create|delete|list|edit|interval|preview>',
  examples: ['sticky create Read the rules before chatting.', 'sticky list', 'sticky interval sticky_abc123 10'],
  subcommands: messages.subcommands.filter((entry) => entry.name.startsWith('sticky ')).map((entry) => ({
    ...entry,
    name: entry.name.replace(/^sticky\s+/, ''),
    parent: 'sticky',
    usage: entry.usage.replace(/^sticky\s+/, 'sticky ')
  })),
  typing: true,

  execute({ message, args, rawArgsInput }) {
    return messages.executeArea({ message, args, area: 'sticky', rawAreaInput: rawArgsInput });
  }
};
