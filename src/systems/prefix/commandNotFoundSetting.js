const db = require('../../services/database');

function normalize(settings) {
  return {
    enabled: settings?.settings_json?.command_not_found?.enabled !== false
  };
}

async function getCommandNotFoundSettings(guildId) {
  if (!guildId) return { enabled: true };
  const settings = await db.getGuildSettings(guildId);
  return normalize(settings);
}

async function setCommandNotFoundEnabled(guildId, enabled) {
  const settings = await db.getGuildSettings(guildId);
  const next = {
    ...(settings.settings_json || {}),
    command_not_found: {
      enabled: Boolean(enabled)
    }
  };
  await db.updateGuildSettings(guildId, { settings_json: next });
  return {
    enabled: Boolean(enabled)
  };
}

module.exports = {
  getCommandNotFoundSettings,
  setCommandNotFoundEnabled
};
