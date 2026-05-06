const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findUser, canTarget, modlog } = require('../../utils/moderationSimple');

module.exports = {
  name: 'ban',
  aliases: ['b'],
  category: 'moderation',
  description: 'Ban a user.',
  usage: 'ban <user> [reason]',
  examples: ['ban @user spam'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const target = args.shift();
    if (!target) return info(message, 'Usage: `ban <user> [reason]`.');

    const user = await findUser(client, target);
    if (!user) return bad(message, 'User not found.');

    const member = await message.guild.members.fetch(user.id).catch(() => null);
    if (member) {
      const check = canTarget(message, member, 'manage');
      if (!check.ok) return bad(message, check.reason);
    }

    const reason = clean(args, 'Manual ban');
    await message.guild.members.ban(user.id, { reason });
    await modlog(message, 'ban', user.id, reason);

    return ok(message, `Banned ${user.tag}. Reason: ${reason}`);
  }
};