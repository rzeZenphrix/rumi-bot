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
const { getEconomySettings, updateEconomySettings } = require('../../systems/economy/settings');
const { resolveVariables } = require('../../systems/variables/variableRegistry');
const {
  getGuildMessagesConfig,
  updateGuildMessagesConfig
} = require('../../systems/messages/guildMessages');
const {
  getGuildLogConfig,
  updateGuildLogConfig,
  DEFAULT_EVENTS
} = require('../../systems/logging/logConfigStore');
const { getTrustNobodySettings } = require('../../systems/security/trustNobody');

let serverStarted = false;

function parseAllowedOrigins() {
  const raw = process.env.DASHBOARD_ORIGIN || process.env.DASHBOARD_ORIGINS || '*';
  if (!raw || raw === '*') return '*';
  return raw.split(',').map((origin) => origin.trim().replace(/\/$/, '')).filter(Boolean);
}

async function verifyDashboardToken(req, res, next) {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '') || req.query.token || req.body?.token;
  if (!token) return res.status(401).json({ ok: false, error: 'I need a dashboard token.' });

  const serviceSecret = process.env.DASHBOARD_API_SECRET || process.env.BOT_SYNC_SECRET || '';
  if (serviceSecret && token === serviceSecret) {
    req.dashboardSession = {
      id: null,
      user_id: req.body?.userId || req.query.userId || null,
      guild_id: req.body?.guildId || req.params?.guildId || null,
      scopes: ['dashboard:service'],
      expires_at: null
    };
    return next();
  }

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

function ensureDashboardGuild(req, res, guildId) {
  if (req.dashboardSession.guild_id && req.dashboardSession.guild_id !== guildId) {
    res.status(403).json({ ok: false, error: 'I cannot let this session manage that server.' });
    return false;
  }
  return true;
}

function messagesSummary(messages = {}) {
  return {
    enabledSystems: ['welcome', 'leave', 'dm', 'ping', 'system'].filter((key) => messages[key]?.enabled).length,
    stickyCount: Array.isArray(messages.sticky) ? messages.sticky.length : 0,
    pingTargetCount: Array.isArray(messages.ping?.targets) ? messages.ping.targets.length : 0,
    systemTemplateCount: Object.values(messages.system?.templates || {}).filter(Boolean).length
  };
}

function dashboardVariables() {
  return {
    welcome: ['{user.mention}', '{user.tag}', '{guild.name}', '{guild.count}', '{channel.name}', '{date.now_proper}'],
    moderation: ['{user.mention}', '{user.tag}', '{guild.name}', '{punishment.reason}', '{moderator.mention}', '{date.now_proper}']
  };
}

function fakePermissionRow(row = {}) {
  return {
    id: row.id,
    guildId: row.guild_id,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    subjectLabel: row.subject_type === 'role' ? `<@&${row.subject_id}>` : `<@${row.subject_id}>`,
    permission: row.permission,
    enabled: row.enabled !== false,
    createdAt: row.created_at
  };
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

function validateEmbedPayload(embed = {}) {
  const fields = Array.isArray(embed.fields) ? embed.fields : [];
  const totalLength =
    String(embed.title || '').length +
    String(embed.description || '').length +
    String(embed.footer?.text || '').length +
    String(embed.author?.name || '').length +
    fields.reduce((sum, field) => sum + String(field?.name || '').length + String(field?.value || '').length, 0);

  if (String(embed.title || '').length > 256) return 'Embed title cannot be longer than 256 characters.';
  if (String(embed.description || '').length > 4096) return 'Embed description cannot be longer than 4096 characters.';
  if (fields.length > 25) return 'Embeds can have at most 25 fields.';
  if (fields.some((field) => String(field?.name || '').length > 256 || String(field?.value || '').length > 1024)) return 'One of the embed fields is too long.';
  if (String(embed.footer?.text || '').length > 2048) return 'Embed footer cannot be longer than 2048 characters.';
  if (String(embed.author?.name || '').length > 256) return 'Embed author cannot be longer than 256 characters.';
  if (totalLength > 6000) return 'Embed total text cannot be longer than 6000 characters.';
  return null;
}

function normalizeEmbedColor(embed = {}) {
  if (embed.color == null || typeof embed.color === 'number') return embed;
  const text = String(embed.color || '').trim().replace(/^#/, '').replace(/^0x/i, '');
  if (/^[0-9a-f]{6}$/i.test(text)) return { ...embed, color: Number.parseInt(text, 16) };
  const next = { ...embed };
  delete next.color;
  return next;
}

async function resolveEmbedVariables(embed, context) {
  const next = JSON.parse(JSON.stringify(embed || {}));
  const walk = async (value) => {
    if (typeof value === 'string') return resolveVariables(value, context);
    if (Array.isArray(value)) return Promise.all(value.map(walk));
    if (value && typeof value === 'object') {
      const out = {};
      for (const [key, item] of Object.entries(value)) out[key] = await walk(item);
      return out;
    }
    return value;
  };
  return walk(next);
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
    if (!ensureDashboardGuild(req, res, guildId)) return;
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

  app.get('/dashboard/guilds/:guildId/messages', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (!ensureDashboardGuild(req, res, guildId)) return;

    try {
      const messages = await getGuildMessagesConfig(guildId);
      return res.json({
        ok: true,
        messages,
        summary: messagesSummary(messages),
        variables: dashboardVariables()
      });
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not load message settings.' });
    }
  });

  app.patch('/dashboard/guilds/:guildId/messages', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (!ensureDashboardGuild(req, res, guildId)) return;

    try {
      const messages = await updateGuildMessagesConfig(guildId, req.body || {});
      return res.json({
        ok: true,
        messages,
        summary: messagesSummary(messages),
        variables: dashboardVariables()
      });
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not save message settings.' });
    }
  });

  app.get('/dashboard/guilds/:guildId/logging', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (!ensureDashboardGuild(req, res, guildId)) return;

    try {
      const config = await getGuildLogConfig(guildId);
      return res.json({ ok: true, config, events: DEFAULT_EVENTS });
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not load logging settings.' });
    }
  });

  app.patch('/dashboard/guilds/:guildId/logging', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (!ensureDashboardGuild(req, res, guildId)) return;

    try {
      const config = await updateGuildLogConfig(guildId, (current) => {
        const body = req.body || {};
        if (typeof body.enabled === 'boolean') current.enabled = body.enabled;
        if (body.channels && typeof body.channels === 'object') current.channels = body.channels;
        if (body.webhooks && typeof body.webhooks === 'object') current.webhooks = body.webhooks;
        if (body.colors && typeof body.colors === 'object') current.colors = body.colors;
        if (body.ignores && typeof body.ignores === 'object') current.ignores = body.ignores;
      });
      return res.json({ ok: true, config, events: DEFAULT_EVENTS });
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not save logging settings.' });
    }
  });

  app.get('/dashboard/guilds/:guildId/security', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (!ensureDashboardGuild(req, res, guildId)) return;

    try {
      const [securityConfig, fakePermissions, whitelist, trustNobody] = await Promise.all([
        db.getGuildSecurityConfig(guildId).catch(() => null),
        db.listFakePermissions(guildId).catch(() => []),
        db.listWhitelist(guildId, 100).catch(() => []),
        getTrustNobodySettings(guildId).catch(() => ({ enabled: false }))
      ]);

      return res.json({
        ok: true,
        security: securityConfig?.security_json || {},
        antinuke: securityConfig?.antinuke_json || {},
        antiraid: securityConfig?.antiraid_json || {},
        trustNobody,
        thresholds: securityConfig?.thresholds_json || {},
        securityWhitelist: whitelist.map((row) => ({
          userId: row.user_id,
          reason: row.reason,
          addedBy: row.added_by,
          createdAt: row.created_at
        })),
        whitelist: whitelist.map((row) => row.user_id),
        antinukeWhitelist: securityConfig?.antinuke_json?.whitelist || [],
        antiraidWhitelist: securityConfig?.antiraid_json?.whitelist || [],
        fakePermissions: fakePermissions.map(fakePermissionRow)
      });
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not load security settings.' });
    }
  });

  app.get('/dashboard/guilds/:guildId/economy', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (!ensureDashboardGuild(req, res, guildId)) return;

    try {
      const settings = await getEconomySettings(guildId);
      return res.json({ ok: true, settings });
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not load economy settings.' });
    }
  });

  app.patch('/dashboard/guilds/:guildId/economy', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (req.dashboardSession.guild_id && req.dashboardSession.guild_id !== guildId) return res.status(403).json({ ok: false, error: 'I cannot let this session manage that server.' });

    const allowed = [
      'currencyName', 'currencyIcon', 'dailyBase', 'weeklyBase', 'workMin', 'workMax',
      'dailyCooldownSeconds', 'weeklyCooldownSeconds', 'workCooldownSeconds',
      'taxRate', 'inflationEnabled', 'inflationRate', 'voterBoostEnabled', 'disabledCommands',
      'robEnabled', 'robCooldownSeconds', 'robMinAmount', 'robMaxAmount', 'robSuccessRate', 'robFineRate', 'robProtectionHours',
      'casinoEnabled', 'casinoCooldownSeconds', 'casinoMinBet', 'casinoMaxBet'
    ];
    const patch = {};
    for (const key of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) patch[key] = req.body[key];
    }
    if (!Object.keys(patch).length) return res.status(400).json({ ok: false, error: 'I did not receive economy settings I can save.' });

    try {
      const settings = await updateEconomySettings(guildId, (current) => ({ ...current, ...patch }));
      return res.json({ ok: true, settings });
    } catch (_error) {
      return res.status(503).json({ ok: false, error: 'I could not save economy settings.' });
    }
  });

  app.post('/dashboard/guilds/:guildId/embed/send', verifyDashboardToken, async (req, res) => {
    if (!isDashboardReady()) return res.status(503).json(dashboardNotReadyPayload());
    const { guildId } = req.params;
    if (req.dashboardSession.guild_id && req.dashboardSession.guild_id !== guildId) return res.status(403).json({ ok: false, error: 'I cannot let this session manage that server.' });

    const guild = client.guilds?.cache?.get(guildId) || (client.guilds?.fetch ? await client.guilds.fetch(guildId).catch(() => null) : null);
    if (!guild) return res.status(404).json({ ok: false, error: 'I cannot find that server.' });

    const channelId = String(req.body?.channelId || req.body?.channel_id || '').replace(/[<#>]/g, '');
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (!channel?.isTextBased?.()) return res.status(400).json({ ok: false, error: 'Choose a text channel I can send messages in.' });

    const embed = req.body?.embed || {};
    const validation = validateEmbedPayload(embed);
    if (validation) return res.status(400).json({ ok: false, error: validation });

    const renderedEmbed = await resolveEmbedVariables(embed, {
      client,
      guild,
      channel,
      user: req.dashboardSession.user_id ? await client.users.fetch(req.dashboardSession.user_id).catch(() => null) : null
    }).catch(() => embed);

    try {
      const sent = await channel.send({
        content: req.body?.content ? String(req.body.content).slice(0, 2000) : undefined,
        embeds: [normalizeEmbedColor(renderedEmbed)],
        allowedMentions: { parse: [] }
      });
      return res.json({ ok: true, messageId: sent.id, url: `https://discord.com/channels/${guild.id}/${channel.id}/${sent.id}` });
    } catch (_error) {
      return res.status(403).json({ ok: false, error: 'I could not send that embed in the selected channel.' });
    }
  });

  app.listen(port, '0.0.0.0', () => {
    if (process.env.LOG_LEVEL === 'debug') {
      console.log(`[api] Rumi command API listening on http://localhost:${port}`);
    }
  });
}

module.exports = { startApiServer };
