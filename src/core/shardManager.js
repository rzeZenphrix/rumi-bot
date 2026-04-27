require('dotenv').config();

const path = require('node:path');
const { ShardingManager } = require('discord.js');
const logger = require('../systems/logging/logger');
const { classifyNetworkError } = require('../systems/network/errorClassifier');

function token() {
  return process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '';
}

function resolveShardCount() {
  const explicit = process.env.SHARD_COUNT || process.env.SHARD_TOTAL || process.env.TOTAL_SHARDS;

  if (explicit && explicit !== 'auto') {
    const parsed = Number(explicit);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  if (process.env.USE_RECOMMENDED_SHARDS === 'true' || explicit === 'auto') {
    return 'auto';
  }

  return 1;
}

async function startShards() {
  const botToken = token();

  if (!botToken) {
    throw new Error('Missing DISCORD_TOKEN or BOT_TOKEN in .env.');
  }

  const totalShards = resolveShardCount();
  const shardFile = path.join(__dirname, 'client.js');

  if (process.env.STARTUP_LOGS !== 'false') {
    console.log(`[rumi] spawning shards from ${shardFile}`);
  }

  const manager = new ShardingManager(shardFile, {
    token: botToken,
    totalShards,
    respawn: process.env.SHARD_RESPAWN !== 'false',
    mode: process.env.SHARD_MODE || 'process',
    execArgv: ['--trace-uncaught', '--trace-warnings']
  });

  manager.on('shardCreate', (shard) => {
    if (process.env.STARTUP_LOGS !== 'false') {
      console.log(`[rumi] shard ${shard.id} launched`);
    }

    shard.on('ready', () => {
      if (process.env.STARTUP_LOGS !== 'false') {
        console.log(`[rumi] shard ${shard.id} ready`);
      }
    });

    shard.on('disconnect', () => logger.warn({ shardId: shard.id }, 'Shard disconnected'));
    shard.on('reconnecting', () => logger.warn({ shardId: shard.id }, 'Shard reconnecting'));
    shard.on('death', (processRef) => {
      logger.warn(
        {
          shardId: shard.id,
          exitCode: processRef?.exitCode,
          signalCode: processRef?.signalCode
        },
        'Shard died'
      );
    });
    shard.on('error', (error) => logger.error({ shardId: shard.id, error }, 'Shard error'));
  });

  const spawnOptions = {
    amount: totalShards,
    timeout: Number(process.env.SHARD_SPAWN_TIMEOUT || process.env.SHARD_READY_TIMEOUT || 120000),
    delay: Number(process.env.SHARD_SPAWN_DELAY || 5500)
  };

  try {
    await manager.spawn({
      ...spawnOptions
    });
  } catch (error) {
    if (totalShards === 'auto' && error?.message === 'fetch failed') {
      const classified = classifyNetworkError(error.cause || error);
      const allowFallback = process.env.ALLOW_SHARD_AUTO_FALLBACK !== 'false'
        && process.env.NODE_ENV !== 'production';

      if (allowFallback) {
        logger.warn(
          {
            classification: classified.type,
            reason: classified.userMessage
          },
          'Unable to fetch Discord recommended shard count; falling back to one shard for local development.'
        );

        await manager.spawn({
          ...spawnOptions,
          amount: 1
        });
        logger.info({ totalShards: 1, fallback: true }, 'All shards spawned');
        return;
      }

      throw new Error(
        `Unable to fetch Discord's recommended shard count: ${classified.userMessage} Set SHARD_TOTAL=1, SHARD_COUNT=1, or TOTAL_SHARDS=1 to start without the recommendation lookup.`,
        { cause: error }
      );
    }

    throw error;
  }

  logger.info({ totalShards }, 'All shards spawned');
}

module.exports = {
  startShards,
  resolveShardCount
};
