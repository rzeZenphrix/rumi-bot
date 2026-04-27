const db = require('../../services/database');
const logger = require('../logging/logger');
const { parseEmbedScript } = require('../embedScript/parser');

function normalizeName(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 32);
}

async function runCustomCommand({ message, commandName }) {
  if (!message.guild) return { handled: false };

  const name = normalizeName(commandName);
  if (!name) return { handled: false };

  let row;

  try {
    row = await db.getCustomCommand(message.guild.id, name);
  } catch (error) {
    logger.warn(
      {
        error,
        guildId: message.guild.id,
        commandName: name
      },
      'Custom command lookup failed'
    );

    return {
      handled: true,
      error: 'I couldn’t check custom commands because the database is currently unreachable.'
    };
  }

  if (!row) return { handled: false };

  try {
    const payload = parseEmbedScript(row.script, { message });
    await message.channel.send(payload);
    return { handled: true };
  } catch (error) {
    logger.warn(
      {
        error,
        guildId: message.guild.id,
        commandName: name,
        customCommandId: row.id
      },
      'Custom command render failed'
    );

    return {
      handled: true,
      error: `I couldn’t run custom command \`${name}\` because its saved script is invalid.`
    };
  }
}

module.exports = {
  normalizeName,
  runCustomCommand
};
