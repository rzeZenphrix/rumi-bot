const db = require('../../services/database');
const logger = require('../logging/logger');

function shortRaidId(id = '') {
  return String(id || '').split('-')[0] || String(Date.now());
}

async function createRaidIncident(payload) {
  const row = {
    guild_id: payload.guildId,

    status: payload.status || 'open',
    severity: payload.severity || 'medium',
    trigger_type: payload.triggerType || 'unknown',

    risk_score: Math.round(Number(payload.riskScore || 0)),

    wave_stats: payload.waveStats || {},
    affected_users: payload.affectedUsers || [],
    invite_source: payload.inviteSource || {},
    channels_affected: payload.channelsAffected || [],

    messages_deleted: Math.max(0, Number(payload.messagesDeleted || 0)),

    punishments_applied: payload.punishmentsApplied || [],
    raid_mode_actions: payload.raidModeActions || [],
    rollback_actions: payload.rollbackActions || [],

    metadata: payload.metadata || {},

    log_channel_id: payload.logChannelId || null,
    log_message_id: payload.logMessageId || null
  };

  const saved = await db.createAntiRaidIncident(row).catch((error) => {
    logger.error(
      {
        error,
        guildId: payload.guildId,
        row
      },
      'Could not create anti-raid incident. Check SQL migration and database helper exports.'
    );

    return null;
  });

  return saved || {
    id: `local-raid-${Date.now()}`,
    ...row,
    localOnly: true
  };
}

async function updateRaidIncident(id, patch) {
  if (!id || String(id).startsWith('local-raid-')) return null;

  return db.updateAntiRaidIncident(id, patch).catch((error) => {
    logger.error(
      {
        error,
        incidentId: id,
        patch
      },
      'Could not update anti-raid incident'
    );

    return null;
  });
}

async function getRaidIncident(guildId, id) {
  return db.getAntiRaidIncident(guildId, id).catch((error) => {
    logger.error(
      {
        error,
        guildId,
        incidentId: id
      },
      'Could not fetch anti-raid incident'
    );

    return null;
  });
}

async function listRaidIncidents(guildId, options = {}) {
  return db.listAntiRaidIncidents(guildId, options).catch((error) => {
    logger.error(
      {
        error,
        guildId,
        options
      },
      'Could not list anti-raid incidents'
    );

    return [];
  });
}

async function createRaidAction(payload) {
  const row = {
    guild_id: payload.guildId,
    incident_id: payload.incidentId || null,

    user_id: payload.userId || null,
    actor_id: payload.actorId || null,

    action_type: payload.actionType,
    action_result: payload.actionResult || 'pending',

    reason: payload.reason || null,
    metadata: payload.metadata || {}
  };

  return db.createAntiRaidAction(row).catch((error) => {
    logger.warn(
      {
        error,
        guildId: payload.guildId,
        userId: payload.userId,
        actionType: payload.actionType
      },
      'Could not create anti-raid action record'
    );

    return null;
  });
}

async function flagRaidMember(payload) {
  const row = {
    guild_id: payload.guildId,
    user_id: payload.userId,
    flag_type: payload.flagType,
    risk_score: Math.round(Number(payload.riskScore || 0)),
    reason: payload.reason || null,
    metadata: payload.metadata || {},
    expires_at: payload.expiresAt || null
  };

  return db.upsertAntiRaidMemberFlag(row).catch((error) => {
    logger.warn(
      {
        error,
        guildId: payload.guildId,
        userId: payload.userId,
        flagType: payload.flagType
      },
      'Could not upsert anti-raid member flag'
    );

    return null;
  });
}

async function listRaidMemberFlags(guildId, options = {}) {
  return db.listAntiRaidMemberFlags(guildId, options).catch(() => []);
}

module.exports = {
  shortRaidId,

  createRaidIncident,
  updateRaidIncident,
  getRaidIncident,
  listRaidIncidents,

  createRaidAction,

  flagRaidMember,
  listRaidMemberFlags
};