require('dotenv').config();

const path = require('node:path');
const { Collection } = require('discord.js');
const { startShards } = require('./core/shardManager');
const { loadCommands } = require('./core/loader');
const { startApiServer } = require('./services/api/server');
const logger = require('./systems/logging/logger');

process.chdir(path.join(__dirname, '..'));

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught startup exception');
  if (process.env.EXIT_ON_UNCAUGHT_EXCEPTION !== 'false') process.exit(1);
});

process.on('unhandledRejection', (error) => {
  logger.error({ error }, 'Unhandled startup rejection');
});

async function startDashboardApiOnly() {
  if (process.env.ENABLE_API === 'false') return;

  const apiClient = {
    commands: new Collection(),
    user: null
  };

  loadCommands(apiClient);
  startApiServer(apiClient);

  if (process.env.STARTUP_LOGS !== 'false') {
    console.log(`[rumi] dashboard API started on port ${process.env.API_PORT || 3001}`);
  }
}

async function main() {
  const configuredMode = String(process.env.BOT_MODE || '').trim().toLowerCase();
  const mode = configuredMode || (process.env.NO_SHARDS === 'true' || process.env.NODE_ENV === 'production' ? 'single' : 'shard');

  if (process.env.STARTUP_LOGS !== 'false') {
    console.log(`[rumi] starting in ${mode} mode`);
  }

  if (mode === 'single' || mode === 'local' || mode === 'debug') {
    require('./core/client');
    return;
  }

  await startDashboardApiOnly();
  process.env.ENABLE_API = 'false';

  await startShards();

  if (process.env.STARTUP_LOGS !== 'false') {
    console.log('[rumi] shard manager started');
  }
}

main().catch((error) => {
  logger.fatal({ error }, 'Failed to start Rumi');
  console.error('[rumi] failed to start:', error);
  process.exit(1);
});
