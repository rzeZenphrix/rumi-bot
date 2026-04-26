const path = require('path');
const { ShardingManager } = require('discord.js');

async function startShards() {
  const token = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;

  if (!token) {
    throw new Error('Missing DISCORD_TOKEN or BOT_TOKEN in .env.');
  }

  const totalShards =
    process.env.TOTAL_SHARDS && process.env.TOTAL_SHARDS !== 'auto'
      ? Number(process.env.TOTAL_SHARDS)
      : 'auto';

  const shardFile = path.join(__dirname, 'client.js');

  console.log(`[rumi] spawning shards from ${shardFile}`);

  const manager = new ShardingManager(shardFile, {
    token,
    totalShards,
    mode: 'process',
    respawn: false,
    execArgv: ['--trace-uncaught', '--trace-warnings']
  });

  manager.on('shardCreate', (shard) => {
    console.log(`[rumi] shard ${shard.id} launched`);

    shard.on('ready', () => {
      console.log(`[rumi] shard ${shard.id} ready`);
    });

    shard.on('disconnect', () => {
      console.warn(`[rumi] shard ${shard.id} disconnected`);
    });

    shard.on('reconnecting', () => {
      console.warn(`[rumi] shard ${shard.id} reconnecting`);
    });

    shard.on('death', (process) => {
      console.error(
        `[rumi] shard ${shard.id} died with exit code ${process.exitCode}`
      );
    });

    shard.on('error', (error) => {
      console.error(`[rumi] shard ${shard.id} error`, error);
    });
  });

  await manager.spawn({
    timeout: Number(process.env.SHARD_READY_TIMEOUT || 120000),
    delay: Number(process.env.SHARD_SPAWN_DELAY || 5500)
  });

  console.log('[rumi] shard manager started');
}

module.exports = {
  startShards
};