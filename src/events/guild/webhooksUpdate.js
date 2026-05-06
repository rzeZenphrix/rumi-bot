const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { resolveAnyExecutor } = require('../../systems/antinuke/auditWatcher');
const { ACTIONS } = require('../../systems/antinuke/actionTypes');

module.exports = {
  name: Events.WebhooksUpdate || 'webhooksUpdate',

  async execute(_client, channel) {
    if (!channel.guild) return;

    await sendLog(channel.guild, 'webhookUpdate', {
      title: 'Webhooks updated',
      description: `Webhooks were changed in ${channel}.`,
      channelId: channel.id,
      fields: [
        {
          name: 'Channel name',
          value: `\`${channel.name || 'unknown'}\``,
          inline: true
        }
      ]
    }).catch(() => null);

    const audit = await resolveAnyExecutor(channel.guild, [
      {
        actionType: 'webhook_create',
        auditType: ACTIONS.webhook_create.auditType
      },
      {
        actionType: 'webhook_delete',
        auditType: ACTIONS.webhook_delete.auditType
      },
      {
        actionType: 'webhook_update',
        auditType: ACTIONS.webhook_update.auditType
      }
    ], null, {
      delayMs: 700,
      retries: 1,
      allowSeen: true
    }).catch(() => null);

    if (!audit?.actionType) return;

    await handleAntiNukeEvent({
      guild: channel.guild,
      actionType: audit.actionType,
      targetId: channel.id,
      target: channel,
      metadata: {
        targetType: 'channel',
        targetName: channel.name,
        audit
      }
    }).catch((error) => {
      console.error('[WEBHOOKS UPDATE ANTINUKE ERROR]', error);
    });
  }
};