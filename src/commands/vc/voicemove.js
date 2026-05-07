const { PermissionFlagsBits } = require('discord.js');
const { ok, bad, info, findMember, findChannel, isVoice } = require('../../utils/moderationSimple');

module.exports = {
  name: 'voicemove',
  aliases: ['vmove', 'movevoice'],
  category: 'voice',
  description: 'Move a member to a voice channel.',
  usage: 'voicemove <member> <voiceChannel>',
  examples: ['voicemove @noob19 #VC 1'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.MoveMembers],
  botPermissions: [PermissionFlagsBits.MoveMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    const channel = await findChannel(message.guild, args.join(' '));
    if (!member || !isVoice(channel)) return info(message, 'Usage: `voicemove <member> <voiceChannel>`.');
    if (!member.voice.channel) return bad(message, 'That member is not in voice.');

    await member.voice.setChannel(channel, `Moved by ${message.author.tag}`);
    return ok(message, `Moved ${member.user.tag} to ${channel.name}.`);
  }
};