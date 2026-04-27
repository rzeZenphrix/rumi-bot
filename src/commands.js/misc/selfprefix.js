const db = require('../../services/database');
const respond = require('../../utils/respond');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');
const { normalizePrefix, guildPersonalPrefix } = require('../../systems/prefix/prefixManager');

function nextSettingsJson(settings = {}) {
  return {
    ...(settings.settings_json || {}),
    personal_prefixes: {
      ...((settings.settings_json || {}).personal_prefixes || {})
    }
  };
}

module.exports = {
  name: 'selfprefix',
  aliases: ['myprefix', 'sp'],
  description: 'Set or reset your personal command prefix.',
  usage: 'selfprefix set <prefix> | selfprefix reset | selfprefix view',

  async execute({ message, args }) {
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    if (!access?.hasUserPremium && !access?.hasServerPremiumBase) {
      return respond.reply(message, 'bad', 'Self prefix needs user premium or a premium server.');
    }

    const subcommand = (args[0] || 'view').toLowerCase();
    const serverScopedOnly = Boolean(message.guild && !access.hasUserPremium && access.hasServerPremiumBase);
    const settings = message.guild ? await db.getGuildSettings(message.guild.id).catch(() => null) : null;

    if (subcommand === 'view') {
      const prefix = serverScopedOnly
        ? guildPersonalPrefix(settings, message.author.id)
        : await db.getUserPrefix(message.author.id);

      return respond.reply(
        message,
        'info',
        prefix
          ? `I will answer your ${serverScopedOnly ? 'server-only' : 'personal'} prefix \`${prefix}\`.`
          : 'I do not have a personal prefix saved for you yet.'
      );
    }

    if (subcommand === 'set') {
      const nextPrefix = normalizePrefix(args[1]);
      if (!nextPrefix) {
        return respond.reply(message, 'bad', 'I need a prefix from 1-5 characters with no spaces.');
      }

      if (serverScopedOnly) {
        const settingsJson = nextSettingsJson(settings);
        settingsJson.personal_prefixes[message.author.id] = nextPrefix;
        await db.updateGuildSettings(message.guild.id, { settings_json: settingsJson });
      } else {
        await db.setUserPrefix(message.author.id, nextPrefix);
      }

      return respond.reply(message, 'good', `I saved \`${nextPrefix}\` as your ${serverScopedOnly ? 'server-only' : 'personal'} prefix.`);
    }

    if (subcommand === 'reset') {
      if (serverScopedOnly) {
        const settingsJson = nextSettingsJson(settings);
        delete settingsJson.personal_prefixes[message.author.id];
        await db.updateGuildSettings(message.guild.id, { settings_json: settingsJson });
      } else {
        await db.resetUserPrefix(message.author.id);
      }

      return respond.reply(message, 'good', `I removed your ${serverScopedOnly ? 'server-only' : 'personal'} prefix.`);
    }

    return respond.reply(message, 'info', 'I use it like this: `selfprefix view`, `selfprefix set <prefix>`, or `selfprefix reset`.');
  }
};
