const { PermissionFlagsBits } = require('discord.js');
const { clean, ok, bad, info, findUser, modlog } = require('../../utils/moderationSimple');

module.exports = {
  name: 'softban',
  aliases: ['sb'],
  category: 'moderation',
  description: 'Ban, clean one day of messages, then unban.',
  usage: 'softban <user> [reason]',
  examples: ['softban @user spam'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const user = await findUser(client, args.shift());
    if (!user) return info(message, 'Usage: `softban <user> [reason]`.');

    const reason = clean(args, `Softban by ${message.author.tag}`);
    await message.guild.members.ban(user.id, { deleteMessageSeconds: 86400, reason });
    await message.guild.members.unban(user.id, `Softban release: ${reason}`).catch(() => null);
    await modlog(message, 'softban', user.id, reason);

    return ok(message, `Softbanned ${user.tag} and cleaned recent messages.`);
  }
};