const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const respond = require('../../utils/respond');
const { normalizePrefix, DEFAULT_PREFIX, isDefaultPrefixEnabled } = require('../../systems/prefix/prefixManager');

async function setDefaultPrefixEnabled(guildId, enabled) {
  const settings = await db.getGuildSettings(guildId);
  const settingsJson = {
    ...(settings.settings_json || {}),
    default_prefix_enabled: Boolean(enabled)
  };

  await db.updateGuildSettings(guildId, { settings_json: settingsJson });
}

module.exports = {
  name: 'prefix',
  aliases: ['setprefix'],
  category: 'core',
  description: 'View, set, reset, or disable my default prefix in this server.',
  usage: 'prefix <view|set|reset|default on|default off>',
  examples: ['prefix view', 'prefix set !', 'prefix default off', 'prefix reset'],
  guildOnly: true,
  slash: { supported: true },
  subcommands: [
    { name: 'view', aliases: ['status'], description: 'Show the current prefix and fallback state.', usage: 'prefix view', examples: ['prefix view'], slash: { supported: true } },
    { name: 'set', description: 'Set a custom prefix for this server.', usage: 'prefix set <prefix>', examples: ['prefix set !'], slash: { supported: true } },
    { name: 'default', description: 'Enable or disable the default fallback prefix.', usage: 'prefix default <on|off>', examples: ['prefix default off'], slash: { supported: true } },
    { name: 'reset', description: 'Reset this server prefix back to the default fallback.', usage: 'prefix reset', examples: ['prefix reset'], slash: { supported: true } }
  ],

  async execute({ message, args }) {
    const subcommand = (args[0] || 'view').toLowerCase();
    const settings = await db.getGuildSettings(message.guild.id);
    const defaultEnabled = isDefaultPrefixEnabled(settings);

    if (subcommand === 'view' || subcommand === 'status') {
      return respond.reply(
        message,
        'info',
        [
          `I am using \`${settings.prefix || DEFAULT_PREFIX}\` as this server prefix.`,
          `My default fallback prefix \`${DEFAULT_PREFIX}\` is **${defaultEnabled ? 'enabled' : 'disabled'}**.`,
          `You can use \`${settings.prefix || DEFAULT_PREFIX}prefix default off\` if another bot uses my default prefix.`
        ].join('\n')
      );
    }

    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return respond.reply(
        message,
        'bad',
        'I cannot let you change my server prefix without Manage Server.'
      );
    }

    if (subcommand === 'set') {
      const nextPrefix = normalizePrefix(args[1]);

      if (!nextPrefix) {
        return respond.reply(message, 'bad', 'I need a prefix from 1–5 characters with no spaces.');
      }

      await db.setGuildPrefix(message.guild.id, nextPrefix);

      return respond.reply(message, 'good', `I changed this server prefix to \`${nextPrefix}\`.`);
    }

    if (subcommand === 'default') {
      const mode = String(args[1] || '').toLowerCase();

      if (!['on', 'off', 'enable', 'disable', 'enabled', 'disabled'].includes(mode)) {
        return respond.reply(message, 'info', 'I use it like this: `prefix default <on|off>`.');
      }

      const enabled = ['on', 'enable', 'enabled'].includes(mode);
      await setDefaultPrefixEnabled(message.guild.id, enabled);

      return respond.reply(
        message,
        'good',
        `I ${enabled ? 'enabled' : 'disabled'} my default fallback prefix \`${DEFAULT_PREFIX}\` in this server.`
      );
    }

    if (subcommand === 'reset') {
      await db.resetGuildPrefix(message.guild.id);
      await setDefaultPrefixEnabled(message.guild.id, true);

      return respond.reply(message, 'good', `I reset this server prefix to \`${DEFAULT_PREFIX}\` and enabled the fallback prefix.`);
    }

    return respond.reply(message, 'info', 'I use it like this: `prefix view`, `prefix set <prefix>`, `prefix default off`, or `prefix reset`.');
  }
};
