require('dotenv').config();

const http = require('node:http');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const logger = require('../systems/logging/logger');
const nodePlayer = require('../systems/music/nodePlayer');

const PORT = Number(process.env.PORT || process.env.MUSIC_WORKER_PORT || 3000);
const SECRET = String(process.env.MUSIC_WORKER_SECRET || '').trim();

const TOKEN =
  process.env.DISCORD_TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.TOKEN ||
  '';

let ready = false;
let starting = true;

function sendJson(res, status, data) {
  const body = JSON.stringify(data);

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
        return resolve(JSON.parse(body));
      } catch {
        return reject(new Error('Invalid JSON body.'));
      }
    });

    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!SECRET) return false;

  const auth = String(req.headers.authorization || '').trim();
  const headerSecret = String(req.headers['x-music-worker-secret'] || '').trim();

  return (
    auth === `Bearer ${SECRET}` ||
    auth === SECRET ||
    headerSecret === SECRET
  );
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

  // JSON.stringify will call toJSON on discord.js builders, so Components v2 payloads
  // can still be sent back to the main bot as raw component JSON.
  return payload;
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

client.once('ready', async () => {
  logger.info(
    {
      user: client.user?.tag,
      guilds: client.guilds.cache.size
    },
    'Rumi music worker logged in'
  );

  try {
    await nodePlayer.initializeMusicPlayer(client);
    ready = true;
    starting = false;

    logger.info('Rumi music worker is ready');
  } catch (error) {
    ready = false;
    starting = false;

    logger.error({ error }, 'Rumi music worker failed to initialize music player');
  }
});

client.on('error', (error) => {
  logger.error({ error }, 'Music worker Discord client error');
});

client.on('warn', (warning) => {
  logger.warn({ warning }, 'Music worker Discord client warning');
});

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
      const health = await nodePlayer.health().catch((error) => ({
        ok: false,
        error: error.message
      }));

      return sendJson(res, ready ? 200 : 503, {
        ok: ready,
        starting,
        service: 'rumi-music-worker',
        discord: client.user?.tag || null,
        guilds: client.guilds.cache.size,
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
          description: starting
            ? 'The music worker is still starting. Try again in a few seconds.'
            : 'The music worker failed to initialize.'
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

      logger.info(
        {
          guildId,
          command,
          userId: options.userId,
          voiceChannelId: options.voiceChannelId
        },
        'Music worker command received'
      );

      const payload = await nodePlayer.runCommand(guildId, command, options);

      return sendJson(res, 200, safePayload(payload));
    }

    return sendJson(res, 404, {
      ok: false,
      error: 'Not found.'
    });
  } catch (error) {
    logger.error({ error }, 'Music worker request failed');

    return sendJson(res, 500, {
      ok: false,
      replyType: 'bad',
      error: error.message || 'Music worker request failed.',
      description: error.message || 'Music worker request failed.'
    });
  }
});

async function shutdown(signal) {
  logger.info({ signal }, 'Music worker shutting down');

  ready = false;

  try {
    await client.destroy();
  } catch {
    // ignore shutdown errors
  }

  server.close(() => {
    process.exit(0);
  });

  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

if (!TOKEN) {
  logger.error('Missing DISCORD_TOKEN, BOT_TOKEN, or TOKEN for music worker');
  process.exit(1);
}

if (!SECRET) {
  logger.error('Missing MUSIC_WORKER_SECRET. Set the same secret on the main bot and music worker.');
  process.exit(1);
}

server.listen(PORT, '0.0.0.0', () => {
  logger.info({ port: PORT }, 'Music worker HTTP server listening');
});

client.login(TOKEN).catch((error) => {
  logger.error({ error }, 'Music worker failed to login');
  process.exit(1);
});