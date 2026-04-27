const db = require('../../services/database');

const DEFAULT_PREFIX = process.env.DEFAULT_PREFIX || ',';

async function getPrefixSettings(guildId) {
  const settings = await db.getGuildSettings(guildId);
  return {
    prefix: settings.prefix || null,
    defaultPrefixEnabled: settings.settings_json?.default_prefix_enabled !== false
  };
}

async function setCustomPrefix(guildId, prefix) {
  const settings = await getPrefixSettings(guildId);
  await db.setGuildPrefix(guildId, prefix);
  return {
    ...settings,
    prefix
  };
}

async function setDefaultPrefixEnabled(guildId, enabled) {
  const settings = await db.getGuildSettings(guildId);
  const next = {
    ...(settings.settings_json || {}),
    default_prefix_enabled: Boolean(enabled)
  };
  await db.updateGuildSettings(guildId, { settings_json: next });
  return {
    prefix: settings.prefix || null,
    defaultPrefixEnabled: Boolean(enabled)
  };
}

async function getValidPrefixes(guildId, clientId) {
  const settings = await getPrefixSettings(guildId);
  const prefixes = [];

  if (settings.defaultPrefixEnabled) prefixes.push(DEFAULT_PREFIX);
  if (settings.prefix && !prefixes.includes(settings.prefix)) prefixes.push(settings.prefix);

  if (clientId) {
    prefixes.push(`<@${clientId}> `);
    prefixes.push(`<@!${clientId}> `);
  }

  return prefixes;
}

module.exports = {
  DEFAULT_PREFIX,
  getPrefixSettings,
  setCustomPrefix,
  setDefaultPrefixEnabled,
  getValidPrefixes
};
