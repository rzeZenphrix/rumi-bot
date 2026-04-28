const logger = require('../systems/logging/logger');
const { getCommandCatalog } = require('./api/commandCatalog');

function normalizeServiceUrl(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';

  const normalizedProtocol = value.replace(/^(https?):(?!\/\/)/i, '$1://');

  try {
    return new URL(normalizedProtocol).toString().replace(/\/$/, '');
  } catch (_error) {
    return '';
  }
}

function getBackendUrl() {
  return normalizeServiceUrl(
    process.env.RUMI_DASHBOARD_BACKEND_URL ||
    process.env.DASHBOARD_BACKEND_URL ||
    process.env.DASHBOARD_URL ||
    process.env.DASHBOARD_PUBLIC_URL
  );
}

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

async function syncDashboardBackend(client) {
  const base = getBackendUrl();
  if (!base) return false;

  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  const botInfo = {
    name: client.user?.username || 'Rumi',
    avatar_url: client.user?.displayAvatarURL?.({ extension: 'png', size: 512 }) || null,
    description: 'Rumi is your elegant Discord companion for moderation, security, utility, fun, economy, tickets, and social features.',
    server_count: guilds.length,
    user_count: guilds.reduce((total, guild) => total + Number(guild.memberCount || 0), 0)
  };

  await Promise.all([
    postJson(`${base}/api/commands/sync`, getCommandCatalog(client)),
    postJson(`${base}/api/bot-info/sync`, botInfo)
  ]);

  logger.info({ base }, 'Synced runtime data to dashboard backend');
  return true;
}

module.exports = {
  syncDashboardBackend
};
