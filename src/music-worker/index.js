require('dotenv').config();

const http = require('node:http');
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');

const logger = require('../systems/logging/logger');
const nodePlayer = require('../systems/music/nodePlayer');
const lavalinkPlayer = require('../systems/music/lavalinkPlayer');

const PORT = Number(process.env.PORT || process.env.MUSIC_WORKER_PORT || 3000);
const SECRET = String(process.env.MUSIC_WORKER_SECRET || '').trim();

const TOKEN =
  process.env.DISCORD_TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.TOKEN ||
  '';

let ready = false;
let starting = true;
let startupError = null;
let client = null;

function selectedMusicRuntime() {
  const backend = String(process.env.MUSIC_WORKER_BACKEND || process.env.MUSIC_BACKEND || '').trim().toLowerCase();
  if (backend === 'lavalink') return lavalinkPlayer;
  return nodePlayer;
}

function selectedMusicRuntimeName() {
  return selectedMusicRuntime() === lavalinkPlayer ? 'lavalink' : 'node';
}

function log(...args) {
  console.log('[rumi-music-worker]', ...args);
}

function sendJson(res, status, data) {
  const body = JSON.stringify(data, null, 2);

  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body)
  });

  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });

    req.on('end', () => {
      if (!body.trim()) return resolve({});

      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!SECRET) return false;

  const auth = String(req.headers.authorization || '').trim();
  const headerSecret = String(req.headers['x-music-worker-secret'] || '').trim();

  return auth === `Bearer ${SECRET}` || auth === SECRET || headerSecret === SECRET;
}

function cleanOptions(options = {}) {
  return {
    query: options.query,
    value: options.value,
    enabled: options.enabled,
    position: options.position,
    index: options.index,
    from: options.from,
    to: options.to,
    mode: options.mode,
    engine: options.engine,

    userId: options.userId,
    textChannelId: options.textChannelId,
    voiceChannelId: options.voiceChannelId
  };
}

function safePayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return {
      ok: false,
      replyType: 'bad',
      error: 'Invalid music response.',
      description: 'The music worker returned an invalid response.'
    };
  }

  return payload;
}

async function startDiscordClient() {
  if (!TOKEN) {
    startupError = 'Missing DISCORD_TOKEN, BOT_TOKEN, or TOKEN.';
    starting = false;
    log(startupError);
    return;
  }

  if (!SECRET) {
    startupError = 'Missing MUSIC_WORKER_SECRET.';
    starting = false;
    log(startupError);
    return;
  }

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildVoiceStates
    ],
    partials: [Partials.Channel]
  });

  client.once(Events.ClientReady, async () => {
    log(`Discord ready as ${client.user?.tag}. Guilds: ${client.guilds.cache.size}`);

    try {
      await selectedMusicRuntime().initializeMusicPlayer(client);

      ready = true;
      starting = false;
      startupError = null;

      log('Music player ready.');
      logger.info('Rumi music worker is ready');
    } catch (error) {
      ready = false;
      starting = false;
      startupError = error.message || 'Music player initialization failed.';

      log('Music player failed:', startupError);
      logger.error({ error }, 'Rumi music worker failed to initialize music player');
    }
  });

  client.on('error', (error) => {
    log('Discord client error:', error.message);
    logger.error({ error }, 'Music worker Discord client error');
  });

  client.on('warn', (warning) => {
    log('Discord client warning:', warning);
    logger.warn({ warning }, 'Music worker Discord client warning');
  });

  try {
    log('Logging into Discord...');
    await client.login(TOKEN);
  } catch (error) {
    ready = false;
    starting = false;
    startupError = error.message || 'Discord login failed.';

    log('Discord login failed:', startupError);
    logger.error({ error }, 'Music worker failed to login');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      return sendJson(res, 200, {
        ok: true,
        service: 'rumi-music-worker',
        routes: ['/health', '/run']
      });
    }

    if (req.method === 'GET' && url.pathname === '/health') {
      const health = await selectedMusicRuntime().health().catch((error) => ({
        ok: false,
        backend: selectedMusicRuntimeName(),
        error: error.message
      }));

      return sendJson(res, ready ? 200 : 503, {
        ok: ready,
        starting,
        service: 'rumi-music-worker',
        discord: client?.user?.tag || null,
        guilds: client?.guilds?.cache?.size || 0,
        startupError,
        node: process.version,
        port: PORT,
        ...health
      });
    }

    if (req.method === 'POST' && url.pathname === '/run') {
      if (!isAuthorized(req)) {
        return sendJson(res, 401, {
          ok: false,
          replyType: 'bad',
          error: 'Unauthorized music worker request.',
          description: 'Unauthorized music worker request.'
        });
      }

      if (!ready) {
        return sendJson(res, 503, {
          ok: false,
          replyType: 'bad',
          error: 'Music worker is not ready.',
          description: startupError || 'The music worker is still starting.'
        });
      }

      const body = await readJson(req);

      const guildId = String(body.guildId || '').trim();
      const command = String(body.command || '').trim();
      const options = cleanOptions(body.options || {});

      if (!guildId || !command) {
        return sendJson(res, 400, {
          ok: false,
          replyType: 'bad',
          error: 'Missing guildId or command.',
          description: 'Missing guildId or command.'
        });
      }

      log('/run received', {
        guildId,
        command,
        userId: options.userId,
        voiceChannelId: options.voiceChannelId,
        textChannelId: options.textChannelId
      });

      const payload = await selectedMusicRuntime().runCommand(guildId, command, options);

      log('/run completed', {
        guildId,
        command,
        ok: payload?.ok,
        code: payload?.code,
        error: payload?.error,
        description: payload?.description
      });

      return sendJson(res, 200, safePayload(payload));
    }

    return sendJson(res, 404, {
      ok: false,
      error: 'Not found.'
    });
  } catch (error) {
    log('Request failed:', error.message);
    logger.error({ error }, 'Music worker request failed');

    return sendJson(res, 500, {
      ok: false,
      replyType: 'bad',
      error: error.message || 'Music worker request failed.',
      description: error.message || 'Music worker request failed.'
    });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log(`HTTP server listening on 0.0.0.0:${PORT}`);
  logger.info({ port: PORT }, 'Music worker HTTP server listening');

  startDiscordClient().catch((error) => {
    startupError = error.message;
    starting = false;
    log('Startup failed:', startupError);
  });
});

setInterval(() => {
  log('heartbeat', {
    ready,
    starting,
    discord: client?.user?.tag || null,
    startupError
  });
}, 60_000).unref();

async function shutdown(signal) {
  log(`Shutting down: ${signal}`);
  ready = false;

  try {
    await client?.destroy?.();
  } catch {
    // ignore
  }

  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));