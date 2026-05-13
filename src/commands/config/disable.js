const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { setCommandDisabled, isProtectedCommand } = require('../../systems/commands/disabledCommands');
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
  name: 'disable',
  category: 'config',
  description: 'Disable a command or a single subcommand for this server.',
  usage: 'disable <command> [subcommand]',
  examples: ['disable ai', 'disable role color', 'disable play'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ client, message, args }) {
    const targetName = String(args.shift() || '').toLowerCase();
    const subName = String(args.shift() || '').toLowerCase();

    if (!targetName) {
      return respond.reply(message, '', '> Disable a command or subcommand for this server.\n```disable <command>` or `disable <command> <subcommand>`.');
    }

    if (isProtectedCommand(targetName)) {
      return respond.reply(message, 'alert', 'I will **not** disable that management command.');
    }

    if (isDirectMusicCommand(targetName)) {
      await setCommandDisabled(message.guild.id, 'music', targetName, true);
      return respond.reply(message, 'good', `Disabled **${targetName}** for this server.`);
    }

    const command = client.commands.get(targetName);
    if (!command) {
      return respond.reply(message, 'bad', `I could not find a command named **${targetName}**.`);
    }

    if (!subName) {
      await setCommandDisabled(message.guild.id, command.name, null, true);
      return respond.reply(message, 'good', `Disabled **${command.name}** for this server.`);
    }

    const subcommand = resolveSubcommand(command, subName);
    if (!subcommand) {
      return respond.reply(message, 'bad', `I could not find **${subName}** under **${command.name}**.`);
    }

    await setCommandDisabled(message.guild.id, command.name, subcommand.name, true);
    return respond.reply(message, 'good', `Disabled **${command.name} ${subcommand.name}** for this server.`);
  },
};
