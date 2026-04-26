const { ActivityType } = require('discord.js');
const {
  getGlobalCustomization,
  updateGlobalCustomization
} = require('./customizationStore');

const ACTIVITY_TYPES = {
  Playing: ActivityType.Playing,
  Streaming: ActivityType.Streaming,
  Listening: ActivityType.Listening,
  Watching: ActivityType.Watching,
  Competing: ActivityType.Competing
};

function normalizeStatus(status) {
  const clean = String(status || 'online').toLowerCase();

  if (['online', 'idle', 'dnd', 'invisible'].includes(clean)) {
    return clean;
  }

  return 'online';
}

function normalizeActivityType(type) {
  const clean = String(type || 'Watching');

  return ACTIVITY_TYPES[clean] ? clean : 'Watching';
}

async function applyPresence(client, presenceConfig = {}) {
  if (!client?.user) return false;

  const enabled = presenceConfig.enabled !== false;

  if (!enabled) return false;

  const status = normalizeStatus(presenceConfig.status);
  const activityTypeName = normalizeActivityType(presenceConfig.activityType);
  const activityText =
    String(presenceConfig.activityText || 'over the server').slice(0, 128);

  const activity = {
    name: activityText,
    type: ACTIVITY_TYPES[activityTypeName]
  };

  if (activityTypeName === 'Streaming' && presenceConfig.url) {
    activity.url = presenceConfig.url;
  }

  client.user.setPresence({
    status,
    activities: [activity]
  });

  return true;
}

async function applySavedPresence(client) {
  const config = await getGlobalCustomization();
  return applyPresence(client, config.presence);
}

async function setPresence(client, options = {}) {
  const updated = await updateGlobalCustomization((config) => {
    config.presence = {
      ...(config.presence || {}),
      ...options
    };
  });

  await applyPresence(client, updated.presence);

  return updated.presence;
}

module.exports = {
  applyPresence,
  applySavedPresence,
  setPresence
};