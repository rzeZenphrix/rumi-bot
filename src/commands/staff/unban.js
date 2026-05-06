const { PermissionFlagsBits } = require('discord.js');
const { getHardban, removeHardban } = require('../../systems/security/hardbanStore');
const { clean, stripFlags, hasFlag, ok, bad, info, findUser, modlog } = require('../../utils/moderationSimple');

module.exports = {
  name: 'unban',
  aliases: ['rb', 'pardon'],
  category: 'moderation',
  description: 'Unban a user.',
  usage: 'unban <userId> [--force-hardban] [reason]',
  examples: ['unban 123456789012345678 appeal accepted'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const user = await findUser(client, args.shift());
    if (!user) return info(message, 'Usage: `unban <userId> [reason]`.');

    const force = hasFlag(args, ['--force', '--force-hardban']);
    const reasonArgs = stripFlags(args, ['--force', '--force-hardban']);
    const hardban = await getHardban(message.guild.id, user.id);

    if (hardban && !force) {
      return bad(message, `That user is hardbanned. Use \`unban ${user.id} --force-hardban [reason]\` to remove the monitor.`);
    }

    const reason = clean(reasonArgs, 'Manual unban');
    if (hardban && force) await removeHardban(message.guild.id, user.id);

    await message.guild.members.unban(user.id, reason);
    await modlog(message, force && hardban ? 'hardunban' : 'unban', user.id, reason, {
      removedHardbanMonitor: Boolean(force && hardban)
    });

    return ok(message, `Unbanned ${user.tag}. Reason: ${reason}`);
  }
};