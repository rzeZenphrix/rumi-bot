const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

module.exports = {
  name: Events.GuildRoleCreate || 'roleCreate',

  async execute(_client, role) {
    await sendLog(role.guild, 'roleCreate', {
      title: 'Role created',
      description: `${role} was created.`,
      targetId: role.id,
      fields: [
        { name: 'Name', value: `\`${role.name}\``, inline: true },
        { name: 'ID', value: `\`${role.id}\``, inline: true }
      ]
    });

    await handleAntiNukeEvent({
      guild: role.guild,
      actionType: 'role_create',
      targetId: role.id,
      target: role,
      newValue: role,
      metadata: {
        targetType: 'role',
        targetName: role.name
      }
    }).catch(() => null);
  }
};