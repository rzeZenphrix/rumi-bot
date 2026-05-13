const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findMember, modlog } = require('../../utils/moderationSimple');

function canModerate(message, member) {
  if (!member) return { ok: false, reason: 'I could not find that member.' };

  if (member.id === message.guild.ownerId) {
    return { ok: false, reason: 'I cannot moderate the server owner.' };
  }

  if (member.id === message.author.id) {
    return { ok: false, reason: 'You cannot unmute yourself with this command.' };
  }

  const me = message.guild.members.me;

  if (!me?.permissions?.has(PermissionFlagsBits.ModerateMembers)) {
    return { ok: false, reason: 'I need Moderate Members permission.' };
  }

  if (!member.moderatable) {
    return { ok: false, reason: 'I cannot manage that member because of role hierarchy.' };
  }

  if (message.member.id !== message.guild.ownerId) {
    const authorTop = message.member.roles.highest?.position || 0;
    const targetTop = member.roles.highest?.position || 0;

    if (targetTop >= authorTop) {
      return { ok: false, reason: 'You cannot manage a member with an equal or higher role.' };
    }
  }

  return { ok: true };
}

module.exports = {
  name: 'unmute',
  aliases: ['untimeout', 'ut'],
  category: 'moderation',
  description: 'Remove a member timeout.',
  usage: 'unmute <user> [reason]',
  examples: ['unmute @user appeal accepted'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ModerateMembers],
  botPermissions: [PermissionFlagsBits.ModerateMembers],

  async execute({ message, args }) {
    const member = await findMember(message.guild, args.shift());

    if (!member) {
      return info(message, '> Unmute or remove timeout from a member\n```Syntax: unmute <user> [reason]\nExample: unmute @user appeal accepted```');
    }

    const check = canModerate(message, member);
    if (!check.ok) return bad(message, check.reason);

    const reason = clean(args, 'None.');

    await member.timeout(null, reason);

    await modlog(message, 'unmute', member.id, reason).catch(() => null);

    return ok(message, 'good', `Removed timeout from **${member.user.tag}**. Reason: ${reason}`);
  }
};