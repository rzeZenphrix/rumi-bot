const { handleNukeAction, AuditLogEvent } = require('../../systems/antinuke/guard');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: 'guildBanAdd',
  async execute(_client, ban) {
    await sendLog(ban.guild, 'memberBan', {
      title: 'Member banned',
      description: `${ban.user.tag || ban.user.id} was banned.`,
      userId: ban.user.id,
      fields: [
        { name: 'Reason', value: ban.reason || 'No reason provided.', inline: false },
        { name: 'Bot', value: ban.user.bot ? 'Yes' : 'No', inline: true }
      ],
      thumbnail: ban.user.displayAvatarURL?.({ size: 256 })
    });

    await handleNukeAction(ban.guild, AuditLogEvent.MemberBanAdd, 'banAdd', ban.user.id);
  }
};
