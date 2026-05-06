const { PermissionFlagsBits } = require('discord.js');
const { ok, bad, info, findMember } = require('../../utils/moderationSimple');

module.exports = {
  name: 'undeafen',
  aliases: ['serverundeafen'],
  category: 'moderation',
  description: 'Remove server deafening.',
  usage: 'undeafen <member>',
  examples: ['undeafen @user'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.DeafenMembers],
  botPermissions: [PermissionFlagsBits.DeafenMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());
    if (!member) return info(message, 'Usage: `undeafen <member>`.');
    if (!member.voice.channel) return bad(message, 'That member is not in voice.');

    await member.voice.setDeaf(false, `Undeafened by ${message.author.tag}`);
    return ok(message, `Removed server deafening from ${member.user.tag}.`);
  }
};