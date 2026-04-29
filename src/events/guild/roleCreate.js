const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { recordVersionSnapshot } = require('../../systems/serverdata/backups');

module.exports = {
  name: Events.GuildRoleCreate || 'roleCreate',
  async execute(_client, role) {
    await recordVersionSnapshot(role.guild, `Role created: ${role.name}`, 'role_create').catch(() => null);
    await sendLog(role.guild, 'roleCreate', {
      title: 'Role created',
      description: `${role} was created.`,
      targetId: role.id,
      fields: [
        { name: 'Name', value: `\`${role.name}\``, inline: true },
        { name: 'Color', value: `\`${role.hexColor}\``, inline: true },
        { name: 'Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
        { name: 'Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
        { name: 'Position', value: String(role.position), inline: true }
      ]
    });
  }
};
