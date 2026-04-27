const { ActivityType } = require('discord.js');
const {
  getGlobalCustomization,
  updateGlobalCustomization,
  isCustomizationEnabled
} = require('./customizationStore');
const logger = require('../logging/logger');

const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing
};

function normalizeStatus(status) {
  const clean = String(status || '').toLowerCase();
  if (['online', 'idle', 'dnd', 'invisible'].includes(clean)) return clean;
  return 'online';
}

function normalizeActivityType(type) {
  const clean = String(type || '').toLowerCase();
  return ACTIVITY_TYPES[clean];
}

function renderStatsFormat(client, format) {
  const guilds = client.guilds?.cache?.size || 0;
  const users = client.guilds?.cache?.reduce((total, guild) => total + (guild.memberCount || 0), 0) || 0;

  return String(format || 'Watching {servers} servers')
    .replaceAll('{servers}', guilds.toLocaleString())
    .replaceAll('{guilds}', guilds.toLocaleString())
    .replaceAll('{users}', users.toLocaleString())
    .slice(0, 128);
}

async function setPresenceEverywhere(client, presence) {
  if (!client?.user) return false;

  const type = normalizeActivityType(presence.activityType) ?? ActivityType.Watching;
  const activity = {
    name: presence.activityText || 'over your server',
    type
  };

  if (type === ActivityType.Streaming) {
    activity.url = process.env.STREAM_URL || 'https://twitch.tv/discord';
  }

  const payload = {
    status: normalizeStatus(presence.status),
    activities: [activity]
  };

  if (client.shard) {
    await client.shard.broadcastEval(
      (shardClient, context) => shardClient.user.setPresence(context.payload),
      { context: { payload } }
    );
  } else {
    await client.user.setPresence(payload);
  }

  return true;
}

async function applySavedPresence(client) {
  if (!isCustomizationEnabled()) {
    logger.debug('Customization is disabled; skipping saved presence load.');
    return false;
  }

  try {
    const global = getGlobalCustomization();
    const presence = global.stats?.enabled
      ? {
          status: global.presence?.status || 'online',
          activityType: 'watching',
          activityText: renderStatsFormat(client, global.stats.format)
        }
      : (global.presence || {
          status: 'online',
          activityType: 'watching',
          activityText: 'over your server'
        });

    return setPresenceEverywhere(client, presence);
  } catch (error) {
    logger.warn({ error }, 'Saved presence could not be applied; continuing startup.');
    return false;
  }
}

function savePresence({ status, activityType, activityText }) {
  if (!isCustomizationEnabled()) return getGlobalCustomization();

  return updateGlobalCustomization((global) => {
    global.presence = {
      status: normalizeStatus(status),
      activityType: ACTIVITY_TYPES[String(activityType || '').toLowerCase()] ? String(activityType).toLowerCase() : 'watching',
      activityText: activityText || 'over your server'
    };
  });
}

function saveStatsPresence({ enabled, format }) {
  if (!isCustomizationEnabled()) return getGlobalCustomization();

  return updateGlobalCustomization((global) => {
    global.stats = {
      enabled: Boolean(enabled),
      format: format || 'Watching {servers} servers'
    };
  });
}

module.exports = {
  setPresenceEverywhere,
  applySavedPresence,
  savePresence,
  saveStatsPresence,
  normalizeStatus,
  normalizeActivityType
};
