const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { getProtectionSettings, updateProtectionSection, isSecuritySystemEnabled } = require('../../systems/security/protectionConfig');

module.exports = {
  name: 'automod',
  aliases: ['am', 'automoderation'],
  category: 'security',
  description: 'Enable, disable, or inspect automatic moderation.',
  usage: 'automod <status|enable|disable>',
  examples: ['automod status', 'automod enable', 'automod disable'],
  subcommands: [
    { name: 'status', aliases: ['view'], usage: 'automod status', description: 'Show automod state and thresholds.' },
    { name: 'enable', aliases: ['on'], usage: 'automod enable', description: 'Enable automod enforcement.' },
    { name: 'disable', aliases: ['off'], usage: 'automod disable', description: 'Disable automod enforcement.' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'status').toLowerCase();
    const settings = await db.getGuildSettings(message.guild.id).catch(() => null);
    const protection = await getProtectionSettings(message.guild.id).catch(() => null);

    if (!settings || !protection) {
      return respond.reply(message, 'bad', 'I could not load automod settings because the database is currently unreachable.');
    }

    if (sub === 'status') {
      const thresholds = settings.thresholds_json?.automod || {};
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          '**automod**',
          `> Automatically detect spam, raids, and unsafe messages.`,
          '',
          `**Enabled**\n${String(isSecuritySystemEnabled(protection, 'automod', settings.automod_enabled !== false))}`,
          '',
          `**Global security**\n${String(protection.security?.enabled !== false)}`,
          '',
          `**Thresholds**\nmentions: \`${thresholds.mentionLimit ?? 'n/a'}\`, links: \`${thresholds.linkLimit ?? 'n/a'}\`, repeats: \`${thresholds.repeatLimit ?? 'n/a'}\`, timeout: \`${thresholds.timeoutSeconds ?? 'n/a'}s\``
        ].join('\n')
      });
    }

    if (sub === 'enable' || sub === 'on') {
      const saved = await db.updateGuildSettings(message.guild.id, { automod_enabled: true }).catch(() => null);
      if (!saved) {
        return respond.reply(message, 'bad', 'I could not enable automod because the database is currently unreachable.');
      }
      return respond.reply(message, 'good', 'Automod is now enabled.');
    }

    if (sub === 'disable' || sub === 'off') {
      const saved = await db.updateGuildSettings(message.guild.id, { automod_enabled: false }).catch(() => null);
      if (!saved) {
        return respond.reply(message, 'bad', 'I could not disable automod because the database is currently unreachable.');
      }
      return respond.reply(message, 'good', 'Automod is now disabled.');
    }

    return respond.reply(message, 'info', 'Usage: `automod <status|enable|disable>`.');
  }
};
