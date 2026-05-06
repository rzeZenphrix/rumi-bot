const { AuditLogEvent } = require('discord.js');
const logger = require('../../systems/logging/logger');
const { getHardban } = require('../../systems/security/hardbanStore');
const { logModerationAction } = require('../../systems/logging/auditLog');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: 'guildBanRemove',

  async execute(client, ban) {
    const guild = ban.guild;
    const user = ban.user;
    const hardban = await getHardban(guild.id, user.id);

    let executorId = null;

    try {
      const logs = await guild.fetchAuditLogs({ type: AuditLogEvent.MemberBanRemove, limit: 5 });
      const matching = logs.entries.find((entry) => {
        const sameTarget = entry.target?.id === user.id;
        const recent = Date.now() - entry.createdTimestamp < 15_000;
        return sameTarget && recent;
      });
      executorId = matching?.executor?.id || null;
    } catch (error) {
      logger.warn({ error, guildId: guild.id, userId: user.id }, 'Could not read audit log for unban');
    }

    await sendLog(guild, 'memberUnban', {
      title: hardban ? 'Hardbanned member unbanned' : 'Member unbanned',
      description: `${user.tag || user.id} was unbanned.${hardban ? '\nRumi will reapply the hardban.' : ''}`,
      userId: user.id,
      actorId: executorId,
      fields: [
        { name: 'Protected hardban', value: hardban ? 'Yes' : 'No', inline: true },
        { name: 'User ID', value: `\`${user.id}\``, inline: true }
      ],
      thumbnail: user.displayAvatarURL?.({ size: 256 })
    });

    if (!hardban) return;

    const reason = `Hardban monitor: reapplying protected ban${executorId ? ` after unban by ${executorId}` : ''}`;

    try {
      await guild.members.ban(user.id, {
        reason,
        deleteMessageSeconds: hardban.deleteMessageSeconds || 0
      });

      await logModerationAction({
        guildId: guild.id,
        userId: user.id,
        moderatorId: client.user.id,
        actionType: 'hardban_reapply',
        reason,
        metadata: {
          originalModeratorId: hardban.moderatorId,
          attemptedUnbannerId: executorId,
          originalReason: hardban.reason
        }
      }).catch(() => null);

      await sendLog(guild, 'hardbanReapply', {
        title: 'Hardban reapplied',
        description: `Rumi reapplied a protected hardban for ${user.tag || user.id}.`,
        userId: user.id,
        actorId: executorId,
        fields: [
          { name: 'Original reason', value: hardban.reason || 'No reason recorded.', inline: false },
          { name: 'Reapply reason', value: reason, inline: false }
        ],
        thumbnail: user.displayAvatarURL?.({ size: 256 })
      });

      await handleAntiNukeEvent({
        guild: member.guild,
        actionType: 'member_kick',
        targetId: member.id,
        target: member.user,
        metadata: {
          targetType: 'member',
          targetName: member.user.tag || member.user.username,
          auditDelayMs: 900,
          auditRetries: 1
        }
      }).catch(() => null);

      logger.warn({ guildId: guild.id, userId: user.id, executorId }, 'Reapplied hardban after unban attempt');
    } catch (error) {
      logger.error({ error, guildId: guild.id, userId: user.id, executorId }, 'Failed to reapply hardban');
    }
  }
};
