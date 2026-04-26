require('dotenv').config();

const { Collection } = require('discord.js');
const { startShards } = require('./core/shardManager');
const { loadCommands } = require('./core/loader');
const { startApiServer } = require('./services/api/server');
const logger = require('./systems/logging/logger');

process.on('uncaughtException', (error) => {
  console.error('[rumi] uncaught exception:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('[rumi] unhandled rejection:', error);
});

async function startDashboardApiOnly() {
  if (process.env.ENABLE_API === 'false') return;

  const apiClient = {
    commands: new Collection(),
    user: null
  };

  loadCommands(apiClient);
  startApiServer(apiClient);
}

async function main() {
  if (process.env.NO_SHARDS === 'true') {
    console.log('[rumi] starting in single-client debug mode');
    process.env.ENABLE_API = process.env.ENABLE_API || 'true';
    require('./core/client');
    return;
  }

  console.log('[rumi] starting in shard mode');

  await startDashboardApiOnly();

  process.env.ENABLE_API = 'false';

  await startShards();
}

main().catch((error) => {
  console.error('[rumi] failed to start:', error);

  if (logger && typeof logger.fatal === 'function') {
    logger.fatal({ error }, 'Failed to start Rumi');
  }

  process.exit(1);
});