const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  getCommandNotFoundSettings,
  setCommandNotFoundEnabled
} = require('../../systems/prefix/commandNotFoundSetting');

module.exports = {
  name: 'commandnotfound',
  aliases: ['cnf', 'unknowncommand', 'unknown'],
  category: 'config',
  description: 'Control whether I reply when someone uses an unknown prefix command.',
  usage: 'commandnotfound <status|on|off>',
  examples: ['commandnotfound status', 'commandnotfound off', 'commandnotfound on'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  slash: true,
  subcommands: [
    {
      name: 'status',
      description: 'Show the current unknown-command reply setting.',
      usage: 'commandnotfound status',
      examples: ['commandnotfound status']
    },
    {
      name: 'on',
      description: 'Enable the built-in unknown-command reply.',
      usage: 'commandnotfound on',
      examples: ['commandnotfound on']
    },
    {
      name: 'off',
      description: 'Disable the built-in unknown-command reply.',
      usage: 'commandnotfound off',
      examples: ['commandnotfound off']
    }
  ],

  async execute({ message, args }) {
    const action = String(args.shift() || 'status').toLowerCase();

    if (action === 'status') {
      const config = await getCommandNotFoundSettings(message.guild.id).catch(() => null);
      if (!config) {
        return respond.reply(message, 'bad', 'I could not load that setting right now.');
      }

      return respond.reply(message, '', `Command-not-found replies are currently **${config.enabled ? 'on' : 'off'}**.`, {
        mentionUser: false
      });
    }

    if (action === 'on' || action === 'enable') {
      await setCommandNotFoundEnabled(message.guild.id, true);
      return respond.reply(message, 'good', '**I will answer unknown prefix commands again.**', {
        mentionUser: false
      });
    }

    if (action === 'off' || action === 'disable') {
      await setCommandNotFoundEnabled(message.guild.id, false);
      return respond.reply(message, 'good', '**I will stay quiet on unknown prefix commands in this server.**', {
        mentionUser: false
      });
    }

    return respond.reply(message, '', '> Stop the bot from responding to unknown commands\n```commandnotfound <status|on|off>```', {
      mentionUser: false
    });
  }
};
