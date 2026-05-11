const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits
} = require('discord.js');

const { getHardban, removeHardban } = require('../../systems/security/hardbanStore');
const {
  clean,
  stripFlags,
  hasFlag,
  ok,
  bad,
  info,
  findUser,
  modlog
} = require('../../utils/moderationSimple');

function rejoinButton(guildId, userId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`unban_rejoin:${guildId}:${userId}`)
      .setLabel('Get server invite')
      .setStyle(ButtonStyle.Primary)
  );
}

async function sendUnbanDm(user, guild, moderator, reason) {
  try {
    await user.send({
      content: [
        `You have been unbanned from **${guild.name}**.`,
        '',
        `Reason: ${reason}`,
        '',
        'Would you like to join back? Click the button below and I will generate an invite for you.'
      ].join('\n'),
      components: [rejoinButton(guild.id, user.id)],
      allowedMentions: { parse: [] }
    });

    return true;
  } catch {
    return false;
  }
}

module.exports = {
  name: 'unban',
  aliases: ['rb', 'pardon'],
  category: 'moderation',
  description: 'Unban a user.',
  usage: 'unban <userId> [--force-hardban] [reason]',
  examples: ['unban 123456789012345678 appeal accepted'],
  flags: [
    { name: '--force', description: 'Remove the hardban monitor if it exists.' },
    { name: '--force-hardban', description: 'Alias of --force.' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.BanMembers],
  botPermissions: [PermissionFlagsBits.BanMembers],

  async execute({ client, message, args }) {
    const rawArgs = [...args];
    const force = hasFlag(rawArgs, ['--force', '--force-hardban']);
    const cleanArgs = stripFlags(rawArgs, ['--force', '--force-hardban']);

    const target = cleanArgs.shift();
    const user = await findUser(client, target);

    if (!user) {
      return info(message, '> **Unban a user from the server.**\n \n```unban <userId> [reason]```\n \n**Examples:**\n```unban 123456789012345678 appeal accepted```\n Tip: If you wish to unban a hardbanned user, use the flag --force. This can only be done by the server owner.');
    }

    const hardban = await getHardban(message.guild.id, user.id);

    if (hardban && !force) {
      return bad(
        message,
        `That user is **hardbanned**. Only the server owner can remove the hardban monitor with \`${client.config.prefix}\`unban \`${user.id}\` --force [reason].`
      );
    }

    if (hardban && force && message.author.id !== message.guild.ownerId) {
      return bad(message, 'Only the server owner can remove a hardban monitor.');
    }

    const ban = await message.guild.bans.fetch(user.id).catch(() => null);

    if (!ban) {
      return info(message, `${user.tag || user.id} is **not** banned from this server.`);
    }

    const reason = clean(cleanArgs, 'None provided.');

    if (hardban && force) {
      await removeHardban(message.guild.id, user.id);
    }

    await message.guild.members.unban(user.id, reason);

    const dmSent = await sendUnbanDm(user, message.guild, message.author, reason);

    await modlog(message, force && hardban ? 'hardunban' : 'unban', user.id, reason, {
      removedHardbanMonitor: Boolean(force && hardban),
      unbanDmSent: dmSent
    });

    return ok(
      message, 'good',
      `Unbanned **${user.tag}**. Reason: ${reason}${dmSent ? ' \nDM sent.' : ' \nI could not DM them.'}`
    );
  }
};