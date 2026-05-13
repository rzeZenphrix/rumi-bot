const logger = require('../../systems/logging/logger');

let clientPromise = null;
let redisClient = null;
const memory = new Map();
const NULL_SENTINEL = { __rumiCacheNull: true };

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function cacheEnabled() {
  return envFlag('REDIS_ENABLED', Boolean(process.env.REDIS_URL));
}

function prefixKey(key) {
  const prefix = String(process.env.REDIS_KEY_PREFIX || 'rumi').replace(/:+$/g, '');
  return `${prefix}:${key}`;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pack(value) {
  return value == null ? NULL_SENTINEL : value;
}

function unpack(value) {
  return value?.__rumiCacheNull ? null : value;
}

async function getClient() {
  if (!cacheEnabled()) return null;
  if (redisClient?.isOpen) return redisClient;
  if (clientPromise) return clientPromise;

  clientPromise = (async () => {
    const { createClient } = require('redis');
    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy(retries) {
          return Math.min(2000, retries * 100);
        }
      }
    });

    client.on('error', (error) => {
      logger.warn({ error: { message: error?.message } }, 'Redis cache error');
    });

    await client.connect();
    redisClient = client;
    logger.info({ urlConfigured: Boolean(process.env.REDIS_URL) }, 'Redis cache connected');
    return client;
  })().catch((error) => {
    clientPromise = null;
    logger.warn({ error: { message: error?.message } }, 'Redis cache unavailable; using in-memory fallback');
    return null;
  });

  return clientPromise;
}

async function read(key) {
  const fullKey = prefixKey(key);
  const client = await getClient();

  if (client?.isOpen) {
    const raw = await client.get(fullKey).catch(() => null);
    if (raw == null) return { hit: false, value: null };
    try {
      return { hit: true, value: unpack(JSON.parse(raw)) };
    } catch {
      return { hit: false, value: null };
    }
  }

  const entry = memory.get(fullKey);
  if (!entry) return { hit: false, value: null };
  if (entry.expiresAt && Date.now() > entry.expiresAt) {
    memory.delete(fullKey);
    return { hit: false, value: null };
  }
  return { hit: true, value: unpack(clone(entry.value)) };
}

async function get(key) {
  return (await read(key)).value;
}

async function set(key, value, ttlSeconds = Number(process.env.REDIS_DEFAULT_TTL_SECONDS || 60)) {
  const fullKey = prefixKey(key);
  const safeTtl = Math.max(1, Number(ttlSeconds || 60));
  const client = await getClient();

  if (client?.isOpen) {
    await client.set(fullKey, JSON.stringify(pack(value)), { EX: safeTtl }).catch(() => null);
    return value;
  }

  memory.set(fullKey, {
    value: clone(pack(value)),
    expiresAt: Date.now() + safeTtl * 1000
  });
  return value;
}

async function del(key) {
  const fullKey = prefixKey(key);
  const client = await getClient();
  if (client?.isOpen) await client.del(fullKey).catch(() => null);
  memory.delete(fullKey);
}

async function delPattern(pattern) {
  const fullPattern = prefixKey(pattern);
  const client = await getClient();

  if (client?.isOpen) {
    for await (const key of client.scanIterator({ MATCH: fullPattern, COUNT: 100 })) {
      await client.del(key).catch(() => null);
    }
    return;
  }

  const regex = new RegExp(`^${fullPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`);
  for (const key of memory.keys()) {
    if (regex.test(key)) memory.delete(key);
  }
}

async function remember(key, ttlSeconds, loader) {
  const cached = await read(key);
  if (cached.hit) return cached.value;
  const value = await loader();
  await set(key, value, ttlSeconds);
  return value;
}

module.exports = {
  cacheEnabled,
  del,
  delPattern,
  get,
  remember,
  set
};
