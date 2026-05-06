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
const { isCustomizationEnabled, hydrateCustomizationStore } = require('../systems/customization/customizationStore');
const { applyGuildProfilesOnStartup } = require('../systems/customization/profileManager');
const { classifyNetworkError } = require('../systems/network/errorClassifier');
const { syncDashboardBackend } = require('../services/dashboardSync');
const { startAutoJailScheduler } = require('../systems/autojail/engine');
const database = require('../services/database');
const { runSchemaAudit } = require('../systems/database/schemaAudit');
const { startKeepAlive } = require('../systems/runtime/keepAlive');
const { startMarketAlertRunner } = require('../systems/monetization/marketAlerts');
const { syncApplicationCommands } = require('../systems/slashCommands');
const { startGiveawayRunner } = require('../systems/giveaways/manager');

function shouldStartApi() {
  if (process.env.ENABLE_API === 'false') return false;

  const shardList = process.env.SHARD_LIST;
  if (!shardList) return true;

  return shardList
    .split(',')
    .map((id) => id.trim())
    .includes('0');
}

function requiredToken() {
  return process.env.DISCORD_TOKEN || process.env.BOT_TOKEN || '';
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
  ],
  ws: { properties: { $browser: 'Discord iOS' } }
});

client.commands = new Collection();
client.runtimeState = {
  schemaAudit: null
};

loadCommands(client);
loadEvents(client);

if (shouldStartApi()) {
  startApiServer(client);
}

client.once('clientReady', async () => {
  await runSchemaAudit(database, { force: true }).then((audit) => {
    client.runtimeState.schemaAudit = audit;
  }).catch((error) => {
    logger.warn({ error }, 'Schema audit failed during startup');
  });

  if (isCustomizationEnabled()) {
    await hydrateCustomizationStore(client).catch((error) => {
      logger.warn({ error }, 'Customization hydration failed; continuing startup');
    });

    await applySavedPresence(client).catch((error) => {
      logger.warn({ error }, 'Saved presence failed; continuing startup');
    });

    await applyGuildProfilesOnStartup(client).catch((error) => {
      logger.warn({ error }, 'Guild profile customization failed during startup');
    });
  } else {
    logger.info('Customization is disabled; skipping startup customization systems.');
  }

  try {
    startReminderRunner(client);
  } catch (error) {
    logger.warn({ error }, 'Reminder runner failed to start; continuing startup');
  }

  try {
    startMarketAlertRunner(client);
  } catch (error) {
    logger.warn({ error }, 'Market alert runner failed to start; continuing startup');
  }

  try {
    startAutoJailScheduler(client);
  } catch (error) {
    logger.warn({ error }, 'AutoJail scheduler failed to start; continuing startup');
  }

  try {
    startGiveawayRunner(client);
  } catch (error) {
    logger.warn({ error }, 'Giveaway runner failed to start; continuing startup');
  }

  await syncDashboardBackend(client).catch((error) => {
    logger.warn({ error }, 'Dashboard backend sync failed; continuing startup');
  });

  await syncApplicationCommands(client).catch((error) => {
    logger.warn({ error }, 'Slash command sync failed during startup');
  });

  const dashboardSyncMs = Number(process.env.DASHBOARD_SYNC_INTERVAL_MS || 300000);
  if (dashboardSyncMs > 0) {
    setInterval(() => {
      syncDashboardBackend(client).catch((error) => {
        logger.warn({ error }, 'Dashboard backend sync failed during interval');
      });
    }, dashboardSyncMs).unref?.();
  }

  const schemaAuditMs = Math.max(60000, Number(process.env.SCHEMA_AUDIT_INTERVAL_MS || 300000));
  setInterval(() => {
    runSchemaAudit(database, { force: true }).then((audit) => {
      client.runtimeState.schemaAudit = audit;
    }).catch((error) => {
      logger.warn({ error }, 'Schema audit refresh failed');
    });
  }, schemaAuditMs).unref?.();

  startKeepAlive();

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
  logger.error({ error }, 'Unhandled rejection');
});

process.on('uncaughtException', (error) => {
  logger.fatal({ error }, 'Uncaught exception');
  if (process.env.EXIT_ON_UNCAUGHT_EXCEPTION !== 'false') process.exit(1);
});

const token = requiredToken();

if (!token) {
  throw new Error('Missing DISCORD_TOKEN or BOT_TOKEN in .env.');
}

client.login(token).catch((error) => {
  const classified = classifyNetworkError(error.cause || error);
  logger.fatal(
    {
      classification: classified.type,
      reason: classified.userMessage,
      error
    },
    'Failed to login to Discord'
  );
  console.error(`[rumi] failed to login to Discord: ${classified.userMessage}`);
  process.exit(1);
});

module.exports = client;
