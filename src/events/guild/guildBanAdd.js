const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildBanAdd || 'guildBanAdd',

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

    await handleAntiNukeEvent({
      guild: ban.guild,
      actionType: 'member_ban_add',
      targetId: ban.user.id,
      target: ban.user,
      metadata: {
        targetType: 'user',
        targetName: ban.user.tag || ban.user.username
      }
    }).catch(() => null);
  }
};