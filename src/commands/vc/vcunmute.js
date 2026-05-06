const { PermissionFlagsBits } = require('discord.js');
const { ok, bad, info, findMember } = require('../../utils/moderationSimple');

module.exports = {
  name: 'vcunmute',
  aliases: ['serverunmute', 'voiceunmute'],
  category: 'moderation',
  description: 'Remove server voice mute.',
  usage: 'vcunmute <member>',
  examples: ['vcunmute @user'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.MuteMembers],
  botPermissions: [PermissionFlagsBits.MuteMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `vcunmute <member>`.');
    if (!member.voice.channel) return bad(message, 'That member is not in voice.');

    await member.voice.setMute(false, `Voice unmuted by ${message.author.tag}`);
    return ok(message, `Voice-unmuted ${member.user.tag}.`);
  }
};