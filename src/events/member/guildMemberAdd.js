const { Events } = require('discord.js');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { sendLog } = require('../../systems/logging/logDispatcher');
const logger = require('../../systems/logging/logger');
const { maybeAutoJailMember } = require('../../systems/autojail/engine');
const { applyJoinRoles } = require('../../systems/automation/serverRoles');
const { sendJoinMessages } = require('../../systems/messages/guildMessages');
const { recordJoin } = require('../../systems/analytics/serverAnalytics');
const { handleAntiRaidJoin, resolveAndRecordInviteJoin } = require('../../systems/antiraid/guard');
const { assignUnverifiedRole } = require('../../systems/verification/verificationManager');
const { logEventError } = require('../../utils/discordErrors');

module.exports = {
  name: Events.GuildMemberAdd || 'guildMemberAdd',
  async execute(_client, member) {
    await recordJoin(member.guild.id).catch(() => null);
    const created = Math.floor(member.user.createdTimestamp / 1000);
    await sendLog(member.guild, 'memberJoin', {
      title: 'Member joined',
      description: `${member} joined the server.`,
      userId: member.id,
      member,
      fields: [
        { name: 'Account created', value: `<t:${created}:F>\n<t:${created}:R>`, inline: true },
        { name: 'Bot', value: member.user.bot ? 'Yes' : 'No', inline: true },
        { name: 'Member count', value: String(member.guild.memberCount ?? 'Unknown'), inline: true }
      ],
      thumbnail: member.user.displayAvatarURL({ size: 256 })
    });

    if (member.user.bot) {
      await handleAntiNukeEvent({
        guild: member.guild,
        actionType: 'bot_add',
        targetId: member.id,
        target: member.user,
        newValue: member,
        metadata: {
          targetType: 'bot',
          targetName: member.user.tag || member.user.username
        }
      }).catch(() => null);
    }

    const invite = await resolveAndRecordInviteJoin(member).catch(() => undefined);

    await handleAntiRaidJoin(member, invite).catch((error) => {
      logEventError({ eventName: 'antiRaidJoin', guildId: member.guild.id, userId: member.id }, error).catch(() => null);
    });

    await assignUnverifiedRole(member).catch((error) => {
      logEventError({ eventName: 'verificationAssignUnverified', guildId: member.guild.id, userId: member.id }, error).catch(() => null);
    });

    await maybeAutoJailMember(member, 'join').catch((error) => {
      logger.error({ error, guildId: member.guild.id, userId: member.id }, 'AutoJail join handler failed');
    });

    await applyJoinRoles(member).catch((error) => {
      logger.warn({ error, guildId: member.guild.id, userId: member.id }, 'Join-role automation failed');
    });

    await sendJoinMessages(member).catch((error) => {
      logger.warn({ error, guildId: member.guild.id, userId: member.id }, 'Join message automation failed');
    });

  }
};
