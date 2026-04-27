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

function isDefaultPrefixEnabled(settings) {
  const json = settings?.settings_json || {};
  if (json.default_prefix_enabled === false) return false;
  if (json.defaultPrefixEnabled === false) return false;
  return true;
}

function guildPersonalPrefix(settings, userId) {
  const json = settings?.settings_json || {};
  const scoped = json.personal_prefixes || json.personalPrefixes || {};
  return normalizePrefix(scoped?.[userId]);
}

async function getPrefixesForMessage(message) {
  let guildPrefix = DEFAULT_PREFIX;
  let defaultPrefixEnabled = true;
  let userPrefix = null;
  let scopedUserPrefix = null;

  try {
    userPrefix = await db.getUserPrefix(message.author.id);
  } catch (error) {
    logger.warn(
      {
        error,
        userId: message.author.id
      },
      'Could not fetch user prefix; falling back to guild/default prefix'
    );
  }

  if (message.guild) {
    try {
      const settings = await db.getGuildSettings(message.guild.id);
      guildPrefix = settings.prefix || DEFAULT_PREFIX;
      defaultPrefixEnabled = isDefaultPrefixEnabled(settings);
      scopedUserPrefix = guildPersonalPrefix(settings, message.author.id);
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

  const prefixes = [];

  if (scopedUserPrefix) prefixes.push(scopedUserPrefix);
  if (userPrefix) prefixes.push(userPrefix);
  if (guildPrefix && guildPrefix !== DEFAULT_PREFIX) prefixes.push(guildPrefix);
  if (defaultPrefixEnabled) prefixes.push(DEFAULT_PREFIX);

  return uniquePrefixes(prefixes);
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
  matchPrefix,
  isDefaultPrefixEnabled,
  guildPersonalPrefix
};
