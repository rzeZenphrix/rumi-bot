const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'nuke',
  aliases: ['cloneclean', 'resetchannel', 'boom'],
  category: 'moderation',
  description: 'Clone and reset this channel.',
  usage: 'nuke [reason]',
  examples: ['nuke spam cleanup'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    if (!message.guild || typeof message.channel?.clone !== 'function') {
      return respond.reply(message, 'bad', 'This channel cannot be nuked. Use the command inside a normal server channel.', {
        useWebhook: false,
        allowedMentions: { parse: [] }
      });
    }

    const reason = args.join(' ').trim() || `Nuked by ${message.author.tag}`;
    const position = typeof message.channel.rawPosition === 'number'
      ? message.channel.rawPosition
      : message.channel.position;

    const clone = await message.channel.clone({ reason });
    await clone.setPosition(position).catch(() => null);

    await message.channel.delete(reason).catch(() => null);

    return clone.send({
      content: 'first',
      allowedMentions: { parse: [] }
    }).catch(() => null);
  }
};