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
  const normalized = normalizeServiceUrl(
    process.env.RUMI_DASHBOARD_BACKEND_URL ||
    process.env.DASHBOARD_BACKEND_URL ||
    process.env.DASHBOARD_URL ||
    process.env.DASHBOARD_PUBLIC_URL
  );

  return normalized.replace(/\/studio$/i, '');
}

function inviteUrlForGuild(guild, client) {
  if (guild.vanityURLCode) return `https://discord.gg/${guild.vanityURLCode}`;
  const clientId = client.user?.id || process.env.DISCORD_CLIENT_ID || '';
  if (!clientId) return process.env.BOT_INVITE_URL || 'https://discord.com/oauth2/authorize';
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8&guild_id=${guild.id}&disable_guild_select=true`;
}

async function publicGuildShowcase(guild, client) {
  let owner = null;
  try {
    const fetchedOwner = await guild.fetchOwner?.();
    owner = fetchedOwner
      ? {
          id: fetchedOwner.id,
          name: fetchedOwner.user?.globalName || fetchedOwner.user?.username || fetchedOwner.displayName || 'Server owner',
          avatar: fetchedOwner.user?.displayAvatarURL?.({ extension: 'png', size: 96 }) || null
        }
      : null;
  } catch (_error) {
    owner = guild.ownerId ? { id: guild.ownerId, name: 'Server owner', avatar: null } : null;
  }

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL?.({ extension: 'png', size: 128 }) || null,
    memberCount: guild.memberCount || null,
    owner,
    inviteUrl: inviteUrlForGuild(guild, client)
  };
}

async function postJson(url, payload) {
  const headers = { 'content-type': 'application/json' };
  if (process.env.BOT_SYNC_SECRET) {
    headers.authorization = `Bearer ${process.env.BOT_SYNC_SECRET}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch (_error) {
      detail = '';
    }
    throw new Error(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`);
  }
}

async function syncDashboardBackend(client) {
  const base = getBackendUrl();
  if (!base) return false;

  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  const serverShowcase = await Promise.all(
    guilds
      .sort((left, right) => Number(right.memberCount || 0) - Number(left.memberCount || 0))
      .slice(0, 36)
      .map((guild) => publicGuildShowcase(guild, client))
  );
  const database = await db.dbHealthCheck().catch((error) => ({ ok: false, error: error.message }));
  const botInfo = {
    name: client.user?.username || 'Rumi',
    avatar_url: client.user?.displayAvatarURL?.({ extension: 'png', size: 512 }) || null,
    description: 'Rumi is your elegant Discord companion for moderation, security, utility, fun, economy, tickets, and social features.',
    server_count: guilds.length,
    user_count: guilds.reduce((total, guild) => total + Number(guild.memberCount || 0), 0),
    server_showcase: serverShowcase
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
    cluster: process.env.CLUSTER_ID || 'local',
    server_showcase: serverShowcase
  };

  const results = await Promise.allSettled([
    postJson(`${base}/api/commands/sync`, getCommandCatalog(client)),
    postJson(`${base}/api/bot-info/sync`, botInfo),
    postJson(`${base}/api/status/sync`, runtimeStatus)
  ]);

  const labels = ['commands', 'botInfo', 'runtimeStatus'];
  const failures = results
    .map((result, index) => ({ label: labels[index], result }))
    .filter(({ result }) => result.status === 'rejected')
    .map(({ label, result }) => ({ label, error: result.reason?.message || String(result.reason) }));

  if (failures.length) {
    logger.warn({ base, failures }, 'Dashboard backend sync completed with partial failures');
  } else {
    logger.info({ base }, 'Synced runtime data to dashboard backend');
  }

  return failures.length < results.length;
}

module.exports = {
  syncDashboardBackend
};
