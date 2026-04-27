const db = require('../../services/database');
const logger = require('../logging/logger');
const { classifyNetworkError } = require('../network/errorClassifier');

let failureCount = 0;
let disabledUntil = 0;
let runnerStarted = false;

function runnerEnabled() {
  return process.env.REMINDER_RUNNER_ENABLED !== 'false';
}

function isTemporarilyDisabled() {
  return Date.now() < disabledUntil;
}

function backoff(error) {
  failureCount += 1;
  const waitMs = Math.min(300000, 30000 * failureCount);
  disabledUntil = Date.now() + waitMs;
  const classified = classifyNetworkError(error);

  logger.warn(
    {
      failures: failureCount,
      waitMs,
      classification: classified.type,
      retryable: classified.retryable
    },
    'Reminder runner backing off after failure'
  );
}

async function runDueReminders(client) {
  if (!runnerEnabled()) return { skipped: true, reason: 'disabled' };
  if (!db.isSupabaseConfigured?.()) return { skipped: true, reason: 'database_not_configured' };
  if (db.getCircuitState?.().open) return { skipped: true, reason: 'database_circuit_open' };
  if (isTemporarilyDisabled()) return { skipped: true, reason: 'backoff' };

  let data;

  try {
    data = await db.listDueScheduledTasks('reminder', new Date().toISOString(), 10);
    failureCount = 0;
  } catch (error) {
    backoff(error);
    return { ok: false, error };
  }

  for (const task of data) {
    try {
      const channel = await client.channels.fetch(task.channel_id).catch(() => null);

      if (channel?.send) {
        await channel.send({
          content: `<@${task.user_id}> I am reminding you: ${task.payload?.text || 'Reminder'}`,
          allowedMentions: { users: [task.user_id], roles: [] }
        });
      }

      await db.completeScheduledTask(task.id);
    } catch (error) {
      logger.error({ error, taskId: task.id }, 'Reminder task failed');
    }
  }

  return { ok: true, count: data.length };
}

function startReminderRunner(client) {
  if (runnerStarted) return null;
  runnerStarted = true;

  if (!runnerEnabled()) {
    logger.info('Reminder runner disabled by REMINDER_RUNNER_ENABLED=false');
    return null;
  }

  if (!db.isSupabaseConfigured?.()) {
    logger.warn(
      { reason: db.getSupabaseConfigIssue?.() || 'database_not_configured' },
      'Reminder runner not started because Supabase is not available.'
    );
    return null;
  }

  const interval = setInterval(() => {
    runDueReminders(client).catch((error) => {
      logger.warn({ error }, 'Reminder runner tick failed');
    });
  }, Number(process.env.REMINDER_RUNNER_INTERVAL_MS || 30000));

  interval.unref?.();
  return interval;
}

module.exports = {
  startReminderRunner,
  runDueReminders
};
