const crypto = require('node:crypto');
const db = require('../../services/database');

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function createDashboardUrl(userId, guildId, scopes = ['dashboard']) {
  const base = process.env.DASHBOARD_URL || '';
  if (!base) {
    throw new Error('DASHBOARD_URL is not configured.');
  }

  let url;

  try {
    url = new URL(base.replace(/\/$/, '') + '/auth/session');
  } catch (_error) {
    throw new Error('DASHBOARD_URL is not a valid URL.');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const ttlHours = Number(process.env.DASHBOARD_SESSION_TTL_HOURS || 24);
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();

  await db.createDashboardSession({
    token_hash: hashToken(token),
    user_id: userId,
    guild_id: guildId || null,
    scopes,
    expires_at: expiresAt
  });

  url.searchParams.set('token', token);
  if (guildId) url.searchParams.set('guild', guildId);
  return url.toString();
}

module.exports = { createDashboardUrl, hashToken };
