const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findMember } = require('../../utils/moderationSimple');

module.exports = {
  name: 'deafen',
  aliases: ['serverdeafen'],
  category: 'moderation',
  description: 'Server-deafen a voice member.',
  usage: 'deafen <member> [reason]',
  examples: ['deafen @user'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.DeafenMembers],
  botPermissions: [PermissionFlagsBits.DeafenMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `deafen <member> [reason]`.');
    if (!member.voice.channel) return bad(message, 'That member is not in voice.');

    const reason = clean(args, `Deafened by ${message.author.tag}`);
    await member.voice.setDeaf(true, reason);

    return ok(message, `Server-deafened ${member.user.tag}.`);
  }
};