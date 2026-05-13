const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { setCommandDisabled } = require('../../systems/commands/disabledCommands');
const { isDirectMusicCommand } = require('../../systems/music/musicAliases');

function resolveSubcommand(command, value) {
  const input = String(value || '').trim().toLowerCase();
  if (!input || !Array.isArray(command?.subcommands)) return null;
  return command.subcommands.find((sub) => {
    const aliases = Array.isArray(sub.aliases) ? sub.aliases : [];
    return [sub.name, ...aliases].map((item) => String(item || '').toLowerCase()).includes(input);
  }) || null;
}

module.exports = {
  name: 'enable',
  category: 'config',
  description: 'Re-enable a command or a single subcommand for this server.',
  usage: 'enable <command> [subcommand]',
  examples: ['enable ai', 'enable role color', 'enable play'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ client, message, args }) {
    const targetName = String(args.shift() || '').toLowerCase();
    const subName = String(args.shift() || '').toLowerCase();

    if (!targetName) {
      return respond.reply(message, '', '> Re-enable a command or subcommand for this server.\n```enable <command>` or `enable <command> <subcommand>`.');
    }

    if (isDirectMusicCommand(targetName)) {
      await setCommandDisabled(message.guild.id, 'music', targetName, false);
      return respond.reply(message, 'good', `Enabled **${targetName}** for this server.`);
    }

    const command = client.commands.get(targetName);
    if (!command) {
      return respond.reply(message, 'bad', `I could not find a command named **${targetName}**.`);
    }

    if (!subName) {
      await setCommandDisabled(message.guild.id, command.name, null, false);
      return respond.reply(message, 'good', `Enabled **${command.name}** for this server.`);
    }

    const subcommand = resolveSubcommand(command, subName);
    if (!subcommand) {
      return respond.reply(message, 'bad', `I could not find **${subName}** under **${command.name}**.`);
    }

    await setCommandDisabled(message.guild.id, command.name, subcommand.name, false);
    return respond.reply(message, 'good', `Enabled **${command.name} ${subcommand.name}** for this server.`);
  },
};
