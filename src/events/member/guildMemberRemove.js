const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { cleanupBoosterRoles } = require('../../systems/boosterroles/store');
const { sendLeaveMessages } = require('../../systems/messages/guildMessages');
const { recordLeave } = require('../../systems/analytics/serverAnalytics');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { handleMemberLeave } = require('../../systems/giveaways/manager');

module.exports = {
  name: Events.GuildMemberRemove,

  async execute(_client, member) {
    await recordLeave(member.guild.id).catch(() => null);
    await handleMemberLeave(member).catch(() => null);
    await cleanupBoosterRoles(member.guild, { automatic: true }).catch(() => null);
    await sendLeaveMessages(member).catch(() => null);

    await sendLog(member.guild, 'memberLeave', {
      title: 'Member left',
      description: `${member.user.tag || member.id} left the server.`,
      userId: member.id,
      member,
      fields: [
        {
          name: 'Roles',
          value: member.roles?.cache?.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(', ') || 'None',
          inline: false
        },
        {
          name: 'Member count',
          value: String(member.guild.memberCount ?? 'Unknown'),
          inline: true
        }
      ],
      thumbnail: member.user.displayAvatarURL({ size: 256 })
    });

    /**
     * Best-effort kick detection.
     * If the member left normally, auditWatcher will not find a fresh kick entry.
     */
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
  }
};
