const logger = require('../systems/logging/logger');
const { getCommandCatalog } = require('./api/commandCatalog');
const db = require('./database');

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
  const database = await db.dbHealthCheck().catch((error) => ({ ok: false, error: error.message }));
  const botInfo = {
    name: client.user?.username || 'Rumi',
    avatar_url: client.user?.displayAvatarURL?.({ extension: 'png', size: 512 }) || null,
    description: 'Rumi is your elegant Discord companion for moderation, security, utility, fun, economy, tickets, and social features.',
    server_count: guilds.length,
    user_count: guilds.reduce((total, guild) => total + Number(guild.memberCount || 0), 0)
  };
  const runtimeStatus = {
    ok: true,
    ready: Boolean(client.user),
    name: 'rumi',
    uptime: process.uptime(),
    commands: client.commands?.size || 0,
    total_commands: getCommandCatalog(client).count || 0,
    guilds: guilds.length,
    total_guilds: guilds.length,
    users: botInfo.user_count,
    total_users: botInfo.user_count,
    ping: client.ws?.ping ?? 0,
    avg_ping: client.ws?.ping ?? 0,
    shards: (client.shard?.ids || [0]).map((id) => ({
      id,
      status: client.isReady?.() ? 'ready' : 'starting',
      ping: client.ws?.ping ?? 0,
      guilds: guilds.length,
      users: botInfo.user_count
    })),
    clusters: [{
      id: process.env.CLUSTER_ID || 'local',
      status: client.isReady?.() ? 'ready' : 'starting',
      shards: client.shard?.ids || [0]
    }],
    database,
    schema: client.runtimeState?.schemaAudit || null,
    memory: process.memoryUsage(),
    cluster: process.env.CLUSTER_ID || 'local'
  };

  await Promise.all([
    postJson(`${base}/api/commands/sync`, getCommandCatalog(client)),
    postJson(`${base}/api/bot-info/sync`, botInfo),
    postJson(`${base}/api/status/sync`, runtimeStatus)
  ]);

  logger.info({ base }, 'Synced runtime data to dashboard backend');
  return true;
}

module.exports = {
  syncDashboardBackend
};
