const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const logger = require('../../systems/logging/logger');
const { handleMemberJoin } = require('../../systems/antiraid/guard');
const { maybeAutoJailMember } = require('../../systems/autojail/engine');
const { applyJoinRoles } = require('../../systems/automation/serverRoles');

module.exports = {
  name: Events.GuildMemberAdd || 'guildMemberAdd',
  async execute(_client, member) {
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

    await handleMemberJoin(member).catch((error) => {
      logger.error({ error, guildId: member.guild.id, userId: member.id }, 'Anti-raid join handler failed');
    });

    await maybeAutoJailMember(member, 'join').catch((error) => {
      logger.error({ error, guildId: member.guild.id, userId: member.id }, 'AutoJail join handler failed');
    });

    await applyJoinRoles(member).catch((error) => {
      logger.warn({ error, guildId: member.guild.id, userId: member.id }, 'Join-role automation failed');
    });
  }
};
