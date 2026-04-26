const { handleNukeAction, AuditLogEvent } = require('../../systems/antinuke/guard');
const { sendLog } = require('../../systems/logging/logDispatcher');

module.exports = {
  name: 'roleDelete',
  async execute(_client, role) {
    await sendLog(role.guild, 'roleDelete', {
      title: 'Role deleted',
      description: `Role **${role.name}** was deleted.`,
      targetId: role.id,
      fields: [
        { name: 'Name', value: `\`${role.name}\``, inline: true },
        { name: 'ID', value: `\`${role.id}\``, inline: true },
        { name: 'Color', value: `\`${role.hexColor}\``, inline: true },
        { name: 'Members', value: String(role.members?.size || 0), inline: true }
      ]
    });

    await handleNukeAction(role.guild, AuditLogEvent.RoleDelete, 'roleDelete', role.id);
  }
};
