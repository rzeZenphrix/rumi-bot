const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const {
  getProtectionSettings,
  updateProtectionSection,
  updateProtectionConfig,
  isSecuritySystemEnabled
} = require('../../systems/security/protectionConfig');

const SYSTEMS = ['automod', 'antinuke', 'antiraid', 'autojail'];

function label(enabled) {
  return enabled ? 'enabled' : 'disabled';
}

async function setSystemState(guildId, system, enabled) {
  if (system === 'automod') {
    return db.updateGuildSettings(guildId, { automod_enabled: enabled });
  }
  if (system === 'autojail') {
    return db.updateGuildSettings(guildId, { jail_enabled: enabled });
  }
  return updateProtectionSection(guildId, system, (current) => ({
    ...current,
    enabled
  }));
}

module.exports = {
  name: 'security',
  aliases: ['sec'],
  category: 'security',
  description: 'Control global security state and inspect protection systems.',
  usage: 'security <status|enable|disable> [all|automod|antinuke|antiraid|autojail]',
  examples: ['security status', 'security disable all', 'security enable automod'],
  subcommands: [
    { name: 'status', usage: 'security status', description: 'Show global and per-system protection state.' },
    { name: 'enable', usage: 'security enable <all|automod|antinuke|antiraid|autojail>', description: 'Enable all or one protection system.' },
    { name: 'disable', usage: 'security disable <all|automod|antinuke|antiraid|autojail>', description: 'Disable all or one protection system.' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],
  typing: true,

  async execute({ message, args }) {
    const sub = String(args.shift() || 'status').toLowerCase();
    const target = String(args.shift() || 'all').toLowerCase();
    const protection = await getProtectionSettings(message.guild.id).catch(() => null);

    if (!protection) {
      return respond.reply(message, 'bad', 'I could not load security settings because the database is currently unreachable.');
    }

    if (sub === 'status') {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          '**security**',
          '> Control global server protection and inspect the current protection state.',
          '',
          `Global: **${label(protection.security?.enabled !== false)}**`,
          `Automod: **${label(isSecuritySystemEnabled(protection, 'automod', protection.row?.automod_enabled !== false))}**`,
          `AntiNuke: **${label(isSecuritySystemEnabled(protection, 'antinuke'))}**`,
          `AntiRaid: **${label(isSecuritySystemEnabled(protection, 'antiraid'))}**`,
          `AutoJail: **${label(isSecuritySystemEnabled(protection, 'autojail', protection.row?.jail_enabled !== false))}**`
        ].join('\n')
      });
    }

    if (!['enable', 'disable'].includes(sub)) {
      return respond.reply(message, 'info', 'Usage: `security <status|enable|disable> [all|automod|antinuke|antiraid|autojail]`.');
    }

    const enabled = sub === 'enable';
    if (target === 'all') {
      const saved = await updateProtectionConfig(message.guild.id, (current) => ({
        ...current,
        security: {
          ...(current.security || {}),
          enabled
        },
        antinuke: {
          ...(current.antinuke || {}),
          enabled
        },
        antiraid: {
          ...(current.antiraid || {}),
          enabled
        }
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', `I could not ${sub} security because the database is currently unreachable.`);
      }

      const togglesSaved = await db.updateGuildSettings(message.guild.id, {
        automod_enabled: enabled,
        jail_enabled: enabled
      }).catch(() => null);

      if (!togglesSaved) {
        return respond.reply(message, 'bad', `I could not ${sub} automod and autojail toggles because the database is currently unreachable.`);
      }

      return respond.reply(message, 'good', `Security is now ${enabled ? 'enabled' : 'disabled'} for all major protection systems.`);
    }

    if (!SYSTEMS.includes(target)) {
      return respond.reply(message, 'info', 'Use `security enable|disable <all|automod|antinuke|antiraid|autojail>`.');
    }

    const saved = await setSystemState(message.guild.id, target, enabled).catch(() => null);
    if (!saved) {
      return respond.reply(message, 'bad', `I could not ${sub} ${target} because the database is currently unreachable.`);
    }

    return respond.reply(message, 'good', `${target} is now ${enabled ? 'enabled' : 'disabled'}.`);
  }
};
