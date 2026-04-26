const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');

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
  }
};
