const db = require('../../services/database');
const logger = require('../logging/logger');

async function runDueReminders(client) {
  const { data, error } = await db.supabase
    .from('scheduled_tasks')
    .select('*')
    .eq('task_type', 'reminder')
    .is('completed_at', null)
    .lte('run_at', new Date().toISOString())
    .limit(10);

  if (error) throw error;

  for (const task of data || []) {
    try {
      const channel = await client.channels.fetch(task.channel_id).catch(() => null);
      if (channel?.send) {
        await channel.send({ content: `<@${task.user_id}> I am reminding you: ${task.payload?.text || 'Reminder'}`, allowedMentions: { users: [task.user_id], roles: [] } });
      }
      await db.supabase.from('scheduled_tasks').update({ completed_at: new Date().toISOString() }).eq('id', task.id);
    } catch (error) {
      logger.error({ error, taskId: task.id }, 'Reminder task failed');
    }
  }
}

function startReminderRunner(client) {
  setInterval(() => runDueReminders(client).catch((error) => logger.error({ error }, 'Reminder runner failed')), 30000).unref?.();
}

module.exports = { startReminderRunner, runDueReminders };
