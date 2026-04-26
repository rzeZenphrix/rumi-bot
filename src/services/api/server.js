const express = require('express');
const cors = require('cors');
const { getCommandCatalog } = require('./commandCatalog');
const db = require('../database');
const { hashToken } = require('../../systems/dashboard/session');

let serverStarted = false;

function parseAllowedOrigins() {
  const raw = process.env.DASHBOARD_ORIGIN || process.env.DASHBOARD_ORIGINS || '*';
  if (!raw || raw === '*') return '*';
  return raw.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
}

async function verifyDashboardToken(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token || req.body?.token;
  if (!token) return res.status(401).json({ ok: false, error: 'I need a dashboard token.' });

  const tokenHash = hashToken(token);
  const { data, error } = await db.supabase
    .from('dashboard_sessions')
    .select('*')
    .eq('token_hash', tokenHash)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (error) return res.status(500).json({ ok: false, error: 'I could not verify that dashboard session.' });
  if (!data) return res.status(401).json({ ok: false, error: 'I could not find a valid dashboard session.' });

  req.dashboardSession = data;
  await db.supabase.from('dashboard_sessions').update({ used_at: new Date().toISOString() }).eq('id', data.id).catch?.(() => null);
  return next();
}

function publicGuild(guild) {
  return {
    id: guild.id,
    name: guild.name,
    icon: guild.iconURL?.({ size: 128, extension: 'png' }) || null,
    memberCount: guild.memberCount || null
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
    res.json({
      ok: true,
      name: 'rumi',
      uptime: process.uptime(),
      commands: client.commands?.size || 0,
      ready: Boolean(client.user),
      database,
      user: client.user ? { id: client.user.id, tag: client.user.tag } : null
    });
  });

  app.get('/commands', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(getCommandCatalog(client));
  });

  app.post('/dashboard/session', verifyDashboardToken, (req, res) => {
    res.json({ ok: true, session: { userId: req.dashboardSession.user_id, guildId: req.dashboardSession.guild_id, scopes: req.dashboardSession.scopes, expiresAt: req.dashboardSession.expires_at } });
  });

  app.get('/dashboard/guilds', verifyDashboardToken, async (req, res) => {
    const session = req.dashboardSession;
    const guilds = [];

    for (const guild of client.guilds?.cache?.values?.() || []) {
      if (session.guild_id && guild.id !== session.guild_id) continue;
      guilds.push(publicGuild(guild));
    }

    res.json({ ok: true, guilds });
  });

  app.get('/dashboard/guilds/:guildId/settings', verifyDashboardToken, async (req, res) => {
    const { guildId } = req.params;
    if (req.dashboardSession.guild_id && req.dashboardSession.guild_id !== guildId) return res.status(403).json({ ok: false, error: 'I cannot let this session manage that server.' });
    const settings = await db.getGuildSettings(guildId);
    const fakePermissions = await db.listFakePermissions(guildId).catch(() => []);
    res.json({ ok: true, settings, fakePermissions });
  });

  app.patch('/dashboard/guilds/:guildId/settings', verifyDashboardToken, async (req, res) => {
    const { guildId } = req.params;
    if (req.dashboardSession.guild_id && req.dashboardSession.guild_id !== guildId) return res.status(403).json({ ok: false, error: 'I cannot let this session manage that server.' });

    const allowed = ['prefix', 'automod_enabled', 'jail_enabled', 'jail_role_id', 'jail_channel_id', 'lockdown_active', 'settings_json', 'thresholds_json'];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) patch[key] = req.body[key];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'I did not receive any settings I can save.' });
    const saved = await db.updateGuildSettings(guildId, patch);
    res.json({ ok: true, settings: saved });
  });

  app.listen(port, '0.0.0.0', () => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[api] Rumi command API listening on http://localhost:${port}`);
    }
  });
}

module.exports = { startApiServer };
