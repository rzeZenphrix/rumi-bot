const express = require('express');
const cors = require('cors');
const { getCommandCatalog } = require('./commandCatalog');
const db = require('../database');
const { hashToken } = require('../../systems/dashboard/session');
const musicService = require('../musicService');
const {
  isDashboardReady,
  isMusicReady,
  dashboardNotReadyPayload,
  musicNotReadyPayload
} = require('../../systems/runtime/featureGates');
const { getCatalog, getPremiumStatus } = require('../../systems/monetization/service');

let serverStarted = false;

function parseAllowedOrigins() {
  const raw = process.env.DASHBOARD_ORIGIN || process.env.DASHBOARD_ORIGINS || '*';
  if (!raw || raw === '*') return '*';
  return raw.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
}

async function verifyDashboardToken(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token || req.body?.token;
  if (!token) return res.status(401).json({ ok: false, error: 'I need a dashboard token.' });

  let data;

  try {
    data = await db.getDashboardSessionByTokenHash(hashToken(token));
  } catch (_error) {
    return res.status(503).json({ ok: false, error: 'I could not verify that dashboard session because the database is unavailable.' });
  }

  if (!data) return res.status(401).json({ ok: false, error: 'I could not find a valid dashboard session.' });

  req.dashboardSession = data;
  await db.touchDashboardSession(data.id).catch(() => null);
  return next();
}

function inviteUrlForGuild(guild) {
  if (guild.vanityURLCode) return `https://discord.gg/${guild.vanityURLCode}`;
  const clientId = guild.client?.user?.id || process.env.DISCORD_CLIENT_ID || '';
  if (!clientId) return process.env.BOT_INVITE_URL || 'https://discord.com/oauth2/authorize';
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&scope=bot%20applications.commands&permissions=8&guild_id=${guild.id}&disable_guild_select=true`;
}

async function publicGuild(guild) {
  let owner = null;
  try {
    const fetchedOwner = await guild.fetchOwner?.();
    owner = fetchedOwner
      ? {
          id: fetchedOwner.id,
          name: fetchedOwner.user?.globalName || fetchedOwner.user?.username || fetchedOwner.displayName || 'Server owner',
          avatar: fetchedOwner.user?.displayAvatarURL?.({ size: 96, extension: 'png' }) || null
        }
      : null;
  } catch (_error) {
    owner = guild.ownerId ? { id: guild.ownerId, name: 'Server owner', avatar: null } : null;
  }

  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL?.({ size: 128, extension: 'png' }) || null,
    memberCount: guild.memberCount || null,
    owner,
    inviteUrl: inviteUrlForGuild(guild)
  };
}

async function publicGuilds(client, limit = 30) {
  const guilds = [...(client.guilds?.cache?.values?.() || [])]
    .sort((left, right) => Number(right.memberCount || 0) - Number(left.memberCount || 0))
    .slice(0, Math.max(1, Math.min(60, Number(limit || 30))));

  return Promise.all(guilds.map(publicGuild));
}

function runtimeStatus(client, database) {
  const catalog = getCommandCatalog(client);
  const guilds = [...(client.guilds?.cache?.values?.() || [])];
  const guildCount = guilds.length;
  const userCount = guilds.reduce((total, guild) => total + Number(guild.memberCount || 0), 0);
  const shardIds = client.shard?.ids || [0];

  return {
    ok: true,
    name: 'rumi',
    uptime: process.uptime(),
    commands: catalog.commandCount || 0,
    total_commands: catalog.count || 0,
    ready: Boolean(client.user),
    database,
    schema: client.runtimeState?.schemaAudit || null,
    user: client.user ? { id: client.user.id, tag: client.user.tag } : null,
    guilds: guildCount,
    total_guilds: guildCount,
    users: userCount,
    total_users: userCount,
    ping: client.ws?.ping ?? 0,
    avg_ping: client.ws?.ping ?? 0,
    shards: shardIds.map((id) => ({
      id,
      status: client.isReady?.() ? 'ready' : 'starting',
      ping: client.ws?.ping ?? 0,
      guilds: guildCount,
      users: userCount
    })),
    memory: process.memoryUsage(),
    cluster: process.env.CLUSTER_ID || 'local'
  };
}

function startApiServer(client) {
  if (serverStarted) return;
  serverStarted = true;

  const app = express();
  const port = Number(process.env.API_PORT || process.env.PORT || 3001);
  const allowedOrigins = parseAllowedOrigins();

  app.use(express.json({ limit: '2mb' }));
  app.use(cors({
    origin(origin, callback) {
      if (allowedOrigins === '*') return callback(null, true);
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/$/, '');
      if (allowedOrigins.includes(normalized)) return callback(null, true);
      return callback(new Error(`CORS blocked origin: ${origin}`));
    }
  }));

  app.get('/', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, name: 'rumi-api', routes: ['/health', '/commands', '/dashboard/session', '/dashboard/guilds'] });
  });

  app.get('/health', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const database = await db.dbHealthCheck().catch((error) => ({ ok: false, error: error.message }));
    res.json(runtimeStatus(client, database));
  });

  app.get('/status', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    const database = await db.dbHealthCheck().catch((error) => ({ ok: false, error: error.message }));
    res.json(runtimeStatus(client, database));
  });

  app.get('/commands', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(getCommandCatalog(client));
  });

  app.get('/servers', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    const limit = Math.max(1, Math.min(60, Number(req.query.limit || 30)));
    const guilds = await publicGuilds(client, limit);
    res.json({ ok: true, guilds, count: guilds.length });
  });

  app.get('/premium/catalog', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await getCatalog());
  });

  app.get('/premium/status', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(await getPremiumStatus({
      userId: req.query.userId || null,
      guildId: req.query.guildId || null
    }));
  });

  app.get('/music/state', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!isMusicReady()) return res.status(503).json(musicNotReadyPayload());
    const guildId = req.query.guildId;
    if (!guildId) return res.status(400).json({ ok: false, error: 'I need a guildId.' });
    const payload = await musicService.getState(guildId);
    if (!payload?.ok) return res.status(503).json(payload || { ok: false, error: 'I could not reach the music service.' });
    res.json(payload);
  });

  app.post('/music/command', async (req, res) => {
    if (!isMusicReady()) return res.status(503).json(musicNotReadyPayload());
    const guildId = req.body?.guildId;
    const command = req.body?.command;
    const options = req.body?.options || {};
    if (!guildId || !command) return res.status(400).json({ ok: false, error: 'I need a guildId and command.' });
    const payload = await musicService.runCommand(guildId, command, options);
    if (!payload?.ok) return res.status(503).json(payload || { ok: false, error: 'I could not reach the music service.' });
    res.json(payload);
  });

  app.post('/spotify/link', async (req, res) => {
    if (!isMusicReady()) return res.status(503).json(musicNotReadyPayload());
    const userId = req.body?.userId;
    if (!userId) return res.status(400).json({ ok: false, error: 'I need a userId.' });
    const payload = await musicService.linkSpotify(userId, req.body || {});
    if (!payload?.ok) return res.status(503).json(payload || { ok: false, error: 'I could not reach the music service.' });
    res.json(payload);
  });

  app.post('/spotify/unlink', async (req, res) => {
    if (!isMusicReady()) return res.status(503).json(musicNotReadyPayload());
    const userId = req.body?.userId;
    if (!userId) return res.status(400).json({ ok: false, error: 'I need a userId.' });
    const payload = await musicService.unlinkSpotify(userId);
    if (!payload?.ok) return res.status(503).json(payload || { ok: false, error: 'I could not reach the music service.' });
    res.json(payload);
  });

  app.post('/dashboard/session', verifyDashboardToken, (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    res.json({ ok: true, session: { userId: req.dashboardSession.user_id, guildId: req.dashboardSession.guild_id, scopes: req.dashboardSession.scopes, expiresAt: req.dashboardSession.expires_at } });
  });

  app.get('/dashboard/guilds', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const session = req.dashboardSession;
    const guilds = [];

    for (const guild of client.guilds?.cache?.values?.() || []) {
      if (session.guild_id && guild.id !== session.guild_id) continue;
      guilds.push(await publicGuild(guild));
    }

    res.json({ ok: true, guilds });
  });

  app.get('/dashboard/guilds/:guildId/settings', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (req.dashboardSession.guild_id && req.dashboardSession.guild_id !== guildId) return res.status(403).json({ ok: false, error: 'I cannot let this session manage that server.' });
    let settings;
    let fakePermissions;

    try {
      settings = await db.getGuildSettings(guildId);
      fakePermissions = await db.listFakePermissions(guildId).catch(() => []);
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not load settings because the database is unavailable.' });
    }

    res.json({ ok: true, settings, fakePermissions });
  });

  app.patch('/dashboard/guilds/:guildId/settings', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (req.dashboardSession.guild_id && req.dashboardSession.guild_id !== guildId) return res.status(403).json({ ok: false, error: 'I cannot let this session manage that server.' });

    const allowed = ['prefix', 'automod_enabled', 'jail_enabled', 'jail_role_id', 'jail_channel_id', 'lockdown_active', 'settings_json', 'thresholds_json'];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) patch[key] = req.body[key];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'I did not receive any settings I can save.' });
    let saved;

    try {
      saved = await db.updateGuildSettings(guildId, patch);
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not save settings because the database is unavailable.' });
    }

    res.json({ ok: true, settings: saved });
  });

  app.listen(port, '0.0.0.0', () => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[api] Rumi command API listening on http://localhost:${port}`);
    }
  });
}

module.exports = { startApiServer };
