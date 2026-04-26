const db = require('../../services/database');
const logger = require('../logging/logger');

const DEFAULT_PREFIX = process.env.DEFAULT_PREFIX || ',';

function normalizePrefix(prefix) {
  if (!prefix) return null;

  const cleaned = String(prefix).trim();

  if (!cleaned) return null;
  if (cleaned.length > 5) return null;
  if (/\s/.test(cleaned)) return null;

  return cleaned;
}

async function getPrefixesForMessage(message) {
  let guildPrefix = DEFAULT_PREFIX;
  let userPrefix = null;

  try {
    userPrefix = await db.getUserPrefix(message.author.id);
  } catch (error) {
    logger.warn(
      {
        error,
        userId: message.author.id
      },
      'Could not fetch user prefix; falling back to default prefix'
    );
  }

  if (message.guild) {
    try {
      const settings = await db.getGuildSettings(message.guild.id);
      guildPrefix = settings.prefix || DEFAULT_PREFIX;
    } catch (error) {
      logger.warn(
        {
          error,
          guildId: message.guild.id
        },
        'Could not fetch guild prefix; falling back to default prefix'
      );
    }
  }

  return uniquePrefixes([
    userPrefix,
    guildPrefix,
    DEFAULT_PREFIX
  ]);
}

function uniquePrefixes(prefixes) {
  return [...new Set(prefixes.filter(Boolean))]
    .sort((a, b) => b.length - a.length);
}

async function matchPrefix(message) {
  const prefixes = await getPrefixesForMessage(message);

  for (const prefix of prefixes) {
    if (message.content.startsWith(prefix)) {
      return prefix;
    }
  }

  return null;
}

module.exports = {
  DEFAULT_PREFIX,
  normalizePrefix,
  getPrefixesForMessage,
  matchPrefix
};