const db = require('../../services/database');
const logger = require('../logging/logger');
const { calculateRiskScore } = require('./riskScorer');

async function createUserFlag(options) {
  const confidence = Math.max(0, Math.min(100, Math.round(options.confidence)));

  const flag = await db.createFlag({
    user_id: options.userId,
    guild_id: options.guildId,
    type: options.type,
    confidence,
    evidence: options.evidence || {},
    source_action: options.sourceAction || null
  });

  const flags = await db.getUserFlags(options.userId, {
    limit: 50
  });

  const riskScore = calculateRiskScore(flags);

  await db.updateUserRisk(options.userId, riskScore);

  logger.warn(
    {
      userId: options.userId,
      guildId: options.guildId,
      type: options.type,
      confidence,
      riskScore
    },
    'Created user flag'
  );

  return {
    flag,
    riskScore
  };
}

module.exports = {
  createUserFlag
};