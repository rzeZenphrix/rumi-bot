const db = require('../../services/database');
const logger = require('../logging/logger');

function shortId(id = '') {
  return String(id || '').split('-')[0] || String(Date.now());
}

async function createIncident(payload) {
  const row = {
    guild_id: payload.guildId,
    executor_id: payload.executorId || null,
    executor_tag: payload.executorTag || null,

    status: payload.status || 'open',
    severity: payload.severity || 'medium',
    score: Math.round(Number(payload.score || 0)),

    action_types: payload.actionTypes || [],
    targets: payload.targets || [],
    thresholds: payload.thresholds || {},

    punishment_configured: payload.punishmentConfigured || [],
    punishment_results: payload.punishmentResults || [],

    rollback_mode: payload.rollbackMode || 'off',
    rollback_results: payload.rollbackResults || [],

    trusted_bypass_used: Boolean(payload.trustedBypassUsed),
    metadata: payload.metadata || {},

    log_channel_id: payload.logChannelId || null,
    log_message_id: payload.logMessageId || null
  };

  const saved = await db.createAntiNukeIncident(row).catch((error) => {
    logger.error(
      {
        error,
        guildId: payload.guildId,
        row
      },
      'Could not create anti-nuke incident. Check SQL migration and database helper exports.'
    );

    return null;
  });

  return saved || {
    id: `local-${Date.now()}`,
    ...row,
    localOnly: true
  };
}

async function updateIncident(id, patch) {
  if (!id || String(id).startsWith('local-')) return null;

  return db.updateAntiNukeIncident(id, patch).catch((error) => {
    logger.error(
      {
        error,
        incidentId: id,
        patch
      },
      'Could not update anti-nuke incident'
    );

    return null;
  });
}

async function listIncidents(guildId, limit = 10) {
  return db.listAntiNukeIncidents(guildId, {
    limit
  }).catch((error) => {
    logger.error(
      {
        error,
        guildId
      },
      'Could not list anti-nuke incidents'
    );

    return [];
  });
}

async function getIncident(guildId, id) {
  return db.getAntiNukeIncident(guildId, id).catch((error) => {
    logger.error(
      {
        error,
        guildId,
        incidentId: id
      },
      'Could not fetch anti-nuke incident'
    );

    return null;
  });
}

module.exports = {
  shortId,
  createIncident,
  updateIncident,
  listIncidents,
  getIncident
};