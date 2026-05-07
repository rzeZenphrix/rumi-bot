const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { recordVersionSnapshot } = require('../../systems/serverdata/backups');

module.exports = {
  name: 'roleDelete',
  async execute(_client, role) {
    await recordVersionSnapshot(role.guild, `Role deleted: ${role.name}`, 'role_delete').catch(() => null);
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

    await handleAntiNukeEvent({
      guild: role.guild,
      actionType: 'role_delete',
      targetId: role.id,
      target: role,
      oldValue: role,
      metadata: {
        targetType: 'role',
        targetName: role.name
      }
    }).catch(() => null);
  }
};
