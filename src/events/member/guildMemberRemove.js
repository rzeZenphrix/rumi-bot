const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: Events.GuildMemberRemove,
  async execute(_client, member) {
    await sendLog(member.guild, 'memberLeave', {
      title: 'Member left',
      description: `${member.user.tag || member.id} left the server.`,
      userId: member.id,
      member,
      fields: [
        { name: 'Roles', value: member.roles?.cache?.filter((r) => r.id !== member.guild.id).map((r) => `${r}`).join(', ') || 'None', inline: false },
        { name: 'Member count', value: String(member.guild.memberCount ?? 'Unknown'), inline: true }
      ],
      thumbnail: member.user.displayAvatarURL({ size: 256 })
    });
  }
};
