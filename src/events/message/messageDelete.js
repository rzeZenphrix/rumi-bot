const { AuditLogEvent, Events, PermissionFlagsBits } = require('discord.js');
const logger = require('../../systems/logging/logger');
const { addDeleteSnipe } = require('../../systems/snipe/snipeStore');
const { sendLog } = require('../../systems/logging/logDispatcher');

async function findDeleteExecutor(message) {
  const guild = message.guild;
  const me = guild?.members?.me || await guild?.members?.fetchMe?.().catch(() => null);

  if (!guild || !me?.permissions?.has(PermissionFlagsBits.ViewAuditLog)) return null;

  const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 5 });
  const now = Date.now();

  return logs.entries.find((entry) => {
    const targetMatches = entry.target?.id === message.author?.id;
    const channelMatches = entry.extra?.channel?.id === message.channel?.id;
    const recent = Math.abs(now - entry.createdTimestamp) < 5000;
    return targetMatches && channelMatches && recent;
  }) || null;
}

module.exports = {
  name: Events.MessageDelete,

  async execute(client, message) {
    try {
      if (message.partial || !message.guild) return;

      const auditEntry = await findDeleteExecutor(message).catch((error) => {
        logger.debug?.({ error, guildId: message.guild?.id }, 'Could not resolve delete audit log for snipe');
        return null;
      });

      addDeleteSnipe(
        message,
        auditEntry
          ? { executorId: auditEntry.executor?.id, executorTag: auditEntry.executor?.tag, source: 'audit_log' }
          : { source: 'self_or_unknown' }
      );

      await sendLog(message.guild, 'messageDelete', {
        title: 'Message deleted',
        description: message.content ? message.content.slice(0, 4000) : '*No text content.*',
        userId: message.author?.id,
        actorId: auditEntry?.executor?.id,
        channelId: message.channel?.id,
        fields: [
          { name: 'Message ID', value: `\`${message.id}\``, inline: true },
          { name: 'Attachments', value: String(message.attachments?.size || 0), inline: true },
          { name: 'Delete source', value: auditEntry ? 'Moderator/API' : 'Self or unknown', inline: true }
        ],
        thumbnail: message.author?.displayAvatarURL?.({ size: 256 })
      });
    } catch (error) {
      logger.error({ error, guildId: message.guild?.id, channelId: message.channel?.id }, 'Could not store delete snipe/log');
    }
  }
};
