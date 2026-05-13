const db = require('../services/database');
const logger = require('../systems/logging/logger');

const EXPECTED_CODES = new Set([
  10008,
  10003,
  50001,
  50013,
  50035,
  50045
]);

const EXPECTED_MESSAGE_PATTERNS = [
  /missing permissions/i,
  /missing access/i,
  /unknown message/i,
  /unknown channel/i,
  /cannot send messages/i,
  /cannot use external (emojis|stickers)/i,
  /manage roles/i,
  /manage channels/i,
  /missing guild permissions/i
];

function errorCode(error) {
  return error?.code || error?.rawError?.code || error?.data?.code || null;
}

function discordStatus(error) {
  const status = Number(error?.status || error?.rawError?.status || error?.httpStatus || 0);
  return Number.isFinite(status) && status > 0 ? status : null;
}

function aggregateErrors(error) {
  const values = [];

  for (const source of [error?.errors, error?.rawError?.errors, error?.cause?.errors]) {
    if (!source) continue;

    if (Array.isArray(source)) {
      values.push(...source.map((item) => serializeError(item)));
    } else if (typeof source === 'object') {
      values.push(source);
    }
  }

  if (error instanceof AggregateError) {
    values.push(...[...error.errors].map((item) => serializeError(item)));
  }

  return values.length ? values : null;
}

function serializeError(error) {
  if (!error) return null;

  return {
    type: error.name || error.constructor?.name || 'Error',
    message: String(error.message || error),
    stack: error.stack || null,
    code: errorCode(error),
    status: discordStatus(error),
    method: error.method || null,
    url: error.url || null,
    aggregateErrors: aggregateErrors(error)
  };
}

function classifyDiscordError(error) {
  const code = Number(errorCode(error) || 0);
  const status = discordStatus(error);
  const message = String(error?.message || error?.rawError?.message || error || '');
  const expected =
    EXPECTED_CODES.has(code) ||
    status === 403 ||
    status === 404 ||
    EXPECTED_MESSAGE_PATTERNS.some((pattern) => pattern.test(message));

  let userMessage = 'Something went wrong. I logged it for review.';

  if (code === 50013 || /missing permissions/i.test(message)) {
    userMessage = 'I am missing the Discord permissions needed to do that.';
  } else if (code === 50001 || /missing access/i.test(message)) {
    userMessage = 'I no longer have access to that Discord resource.';
  } else if (code === 10008 || /unknown message/i.test(message)) {
    userMessage = 'That message no longer exists.';
  } else if (code === 10003 || /unknown channel/i.test(message)) {
    userMessage = 'That channel no longer exists or I cannot access it.';
  } else if (/external (emojis|stickers)/i.test(message)) {
    userMessage = 'I cannot use that external emoji or sticker here.';
  }

  return {
    expected,
    level: expected ? 'warn' : 'error',
    code: code || null,
    status,
    userMessage,
    message
  };
}

function shouldSuppressConsoleError(error) {
  const classified = classifyDiscordError(error);
  return classified.expected && process.env.DEBUG_ERRORS !== 'true';
}

function contextFromMessage(message = {}) {
  return {
    guild_id: message.guild?.id || null,
    channel_id: message.channel?.id || null,
    user_id: message.author?.id || message.user?.id || null,
    message_id: message.id || null
  };
}

function contextFromInteraction(interaction = {}) {
  return {
    guild_id: interaction.guildId || interaction.guild?.id || null,
    channel_id: interaction.channelId || interaction.channel?.id || null,
    user_id: interaction.user?.id || interaction.member?.id || null,
    interaction_id: interaction.id || null
  };
}

async function createStoredErrorLog(payload = {}) {
  if (typeof db.createErrorLog !== 'function') return null;
  return db.createErrorLog(payload).catch((error) => {
    if (process.env.DEBUG_ERRORS === 'true') {
      logger.warn({ error }, 'Failed to store bot error log');
    }
    return null;
  });
}

async function logCommandError(context = {}, error) {
  const classified = classifyDiscordError(error);
  const serialized = serializeError(error);
  const messageContext = context.message ? contextFromMessage(context.message) : {};
  const interactionContext = context.interaction ? contextFromInteraction(context.interaction) : {};

  const row = await createStoredErrorLog({
    level: classified.level,
    source: context.source || 'command',
    command_name: context.commandName || context.command || null,
    event_name: context.eventName || null,
    ...messageContext,
    ...interactionContext,
    guild_id: context.guildId || interactionContext.guild_id || messageContext.guild_id || null,
    channel_id: context.channelId || interactionContext.channel_id || messageContext.channel_id || null,
    user_id: context.userId || interactionContext.user_id || messageContext.user_id || null,
    message_id: context.messageId || messageContext.message_id || null,
    interaction_id: context.interactionId || interactionContext.interaction_id || null,
    error_type: serialized?.type,
    error_message: serialized?.message,
    error_stack: serialized?.stack,
    error_code: serialized?.code ? String(serialized.code) : null,
    discord_status: serialized?.status,
    aggregate_errors: serialized?.aggregateErrors,
    metadata: {
      expected: classified.expected,
      file: context.file || null,
      ...context.metadata
    }
  });

  const logPayload = {
    logId: row?.id || null,
    command: context.commandName || context.command || null,
    event: context.eventName || null,
    guildId: context.guildId || messageContext.guild_id || interactionContext.guild_id || null,
    code: classified.code,
    status: classified.status,
    message: classified.message
  };

  if (process.env.DEBUG_ERRORS === 'true') {
    logger[classified.level]?.({ ...logPayload, error }, classified.expected ? 'Expected Discord operation failed' : 'Command/event failed');
  } else if (!classified.expected) {
    logger.error(logPayload, 'Command/event failed; stack stored in database');
  } else {
    logger.warn(logPayload, 'Expected Discord operation failed');
  }

  return { row, classified, serialized };
}

async function logEventError(context = {}, error) {
  return logCommandError({ ...context, source: context.source || 'event' }, error);
}

module.exports = {
  classifyDiscordError,
  shouldSuppressConsoleError,
  serializeError,
  logCommandError,
  logEventError
};
