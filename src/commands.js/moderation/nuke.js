const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

module.exports = {
  name: 'nuke',
  aliases: ['cloneclean', 'resetchannel', 'boom'],
  category: 'moderation',
  description: 'Clone the current channel, delete the old one, and keep settings/position.',
  usage: 'nuke [reason]',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageChannels],
  botPermissions: [PermissionFlagsBits.ManageChannels],

  async execute({ message, args }) {
    const channel = message.channel;
    const reason = args.join(' ') || `Channel nuked by ${message.author.tag}`;
    const position = channel.rawPosition;

    const clone = await channel.clone({ reason });
    await clone.setPosition(position).catch(() => null);
    await channel.delete(reason).catch(() => null);

    await clone.send({ content: 'first', allowedMentions: { parse: [] } }).catch(() => null);

    return respond.send(clone, 'alert', message.author, `nuked this channel. Reason: ${reason}`);
  }
};
