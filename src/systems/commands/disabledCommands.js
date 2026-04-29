const db = require('../../services/database');

const PROTECTED_COMMANDS = new Set(['disable', 'enable', 'help']);

function normalizeName(value) {
  return String(value || '').trim().toLowerCase();
}

function buildKey(commandName, subcommandName = null) {
  const command = normalizeName(commandName);
  const subcommand = normalizeName(subcommandName);
  return subcommand ? `${command}.${subcommand}` : command;
}

async function getDisabledCommands(guildId) {
  const settings = await db.getGuildSettings(guildId);
  return { ...(settings.settings_json?.disabled_commands || {}) };
}

async function saveDisabledCommands(guildId, disabledCommands) {
  const settings = await db.getGuildSettings(guildId);
  const settingsJson = {
    ...(settings.settings_json || {}),
    disabled_commands: disabledCommands,
  };
  await db.updateGuildSettings(guildId, { settings_json: settingsJson });
  return disabledCommands;
}

async function setCommandDisabled(guildId, commandName, subcommandName = null, disabled = true) {
  const key = buildKey(commandName, subcommandName);
  const map = await getDisabledCommands(guildId);
  if (disabled) {
    map[key] = true;
  } else {
    delete map[key];
  }
  await saveDisabledCommands(guildId, map);
  return key;
}

function isProtectedCommand(commandName) {
  return PROTECTED_COMMANDS.has(normalizeName(commandName));
}

function isCommandDisabled(map, commandName, subcommandName = null) {
  const commandKey = buildKey(commandName);
  const subcommandKey = buildKey(commandName, subcommandName);
  return Boolean(map[subcommandKey] || map[commandKey]);
}

module.exports = {
  buildKey,
  getDisabledCommands,
  setCommandDisabled,
  isProtectedCommand,
  isCommandDisabled,
};
