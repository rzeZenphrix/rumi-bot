require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  Collection
} = require('discord.js');

const logger = require('../systems/logging/logger');
const { loadCommands, loadEvents } = require('./loader');
const { startApiServer } = require('../services/api/server');
const { startReminderRunner } = require('../systems/tasks/reminderRunner');
const { applySavedPresence } = require('../systems/customization/presenceManager');

require('../services/database');

function shouldStartApi() {
  if (process.env.ENABLE_API === 'false') return false;

  const shardList = process.env.SHARD_LIST;

  if (!shardList) return true;

  return shardList
    .split(',')
    .map((id) => id.trim())
    .includes('0');
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildExpressions,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Channel,
    Partials.GuildMember,
    Partials.Message,
    Partials.Reaction,
    Partials.User
  ]
});

client.commands = new Collection();

loadCommands(client);
loadEvents(client);

if (shouldStartApi()) {
  startApiServer(client);
}

client.once('clientReady', async () => {
  await applySavedPresence(client).catch((error) => {
    logger.error({ error }, 'Failed to apply saved presence');
  });

  startReminderRunner(client);

  if (process.env.STARTUP_LOGS !== 'false') {
    console.log(`[rumi] logged in as ${client.user.tag}`);
  }

  logger.info(
    {
      tag: client.user?.tag,
      id: client.user?.id,
      shardIds: client.shard?.ids || null,
      commands: client.commands?.size || 0
    },
    'Rumi is online'
  );
});

process.on('unhandledRejection', (error) => {
  console.error('[rumi] unhandled rejection:', error);
  logger.error({ error }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  console.error('[rumi] uncaught exception:', error);
  logger.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

if (process.env.STARTUP_LOGS !== 'false') {
  console.log(`[rumi] shard client starting${client.shard?.ids?.length ? ` for shard ${client.shard.ids.join(',')}` : ''}`);
}

client.login(process.env.DISCORD_TOKEN).catch((error) => {
  console.error('[rumi] failed to login:', error);
  logger.fatal({ error }, 'Failed to login');
  process.exit(1);
});
