const { PermissionFlagsBits } = require('discord.js');
const { ok, bad, info, findMember } = require('../../utils/moderationSimple');

module.exports = {
  name: 'disconnect',
  aliases: ['dc'],
  category: 'voice',
  description: 'Disconnect a member from voice.',
  usage: 'disconnect <member>',
  examples: ['disconnect @user'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.MoveMembers],
  botPermissions: [PermissionFlagsBits.MoveMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `disconnect <member>`.');
    if (!member.voice.channel) return bad(message, 'That member is not in voice.');

    await member.voice.disconnect(`Disconnected by ${message.author.tag}`);
    return ok(message, `Disconnected ${member.user.tag}.`);
  }
};