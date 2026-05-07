const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findMember } = require('../../utils/moderationSimple');

module.exports = {
  name: 'vcmute',
  aliases: ['servermute', 'voicemute'],
  category: 'voice',
  description: 'Server-mute a voice member.',
  usage: 'vcmute <member> [reason]',
  examples: ['vcmute @user mic spam'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.MuteMembers],
  botPermissions: [PermissionFlagsBits.MuteMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `vcmute <member> [reason]`.');
    if (!member.voice.channel) return bad(message, 'That member is not in voice.');

    const reason = clean(args, `Voice muted by ${message.author.tag}`);
    await member.voice.setMute(true, reason);

    return ok(message, `Voice-muted ${member.user.tag}.`);
  }
};