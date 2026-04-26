const logger = require('./logger');
const db = require('../../services/database');

async function logModerationAction(options) {
  const row = {
    guild_id: options.guildId,
    user_id: options.userId || null,
    moderator_id: options.moderatorId || null,
    bot_action: Boolean(options.botAction),
    action_type: options.actionType,
    reason: options.reason || null,
    metadata: options.metadata || {}
  };

  logger.info(row, 'Moderation action');

  try {
    await db.insertPunishmentLog(row);
  } catch (error) {
    logger.error({ error, row }, 'Failed to save moderation action');
  }
}

async function logSecurityEvent(options) {
  const row = {
    guild_id: options.guildId,
    user_id: options.userId || null,
    actor_id: options.actorId || null,
    event_type: options.eventType,
    confidence: options.confidence || 0,
    metadata: options.metadata || {}
  };

  logger.warn(row, 'Security event');

  try {
    await db.insertSecurityEvent(row);
  } catch (error) {
    logger.error({ error, row }, 'Failed to save security event');
  }
}

module.exports = {
  logModerationAction,
  logSecurityEvent
};