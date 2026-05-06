const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { diffField, compactFields } = require('../../utils/logFields');
const { recordVersionSnapshot } = require('../../systems/serverdata/backups');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const {
  detectRolePermissionEscalation,
  detectRoleHierarchyEscalation
} = require('../../systems/antinuke/permissionDiff');

module.exports = {
  name: Events.GuildRoleUpdate || 'roleUpdate',

  async execute(_client, oldRole, newRole) {
    const permissionEscalation = detectRolePermissionEscalation(oldRole, newRole);
    const hierarchyEscalation = detectRoleHierarchyEscalation(oldRole, newRole);

    const fields = compactFields([
      diffField('Name', oldRole.name, newRole.name),
      diffField('Color', oldRole.hexColor, newRole.hexColor),
      diffField('Hoisted', oldRole.hoist, newRole.hoist),
      diffField('Mentionable', oldRole.mentionable, newRole.mentionable),
      diffField('Permissions bitfield', oldRole.permissions.bitfield.toString(), newRole.permissions.bitfield.toString(), false),
      diffField('Position', oldRole.position, newRole.position),
      permissionEscalation.escalated
        ? {
            name: 'Dangerous permissions added',
            value: permissionEscalation.added.map((item) => `• ${item.name}`).join('\n').slice(0, 1024),
            inline: false
          }
        : null,
      hierarchyEscalation.escalated
        ? {
            name: 'Hierarchy escalated',
            value: `${oldRole.position} → ${newRole.position}`,
            inline: true
          }
        : null,
      { name: 'Role ID', value: `\`${newRole.id}\``, inline: true }
    ]);

    if (fields.length <= 1) return;

    await recordVersionSnapshot(newRole.guild, `Role updated: ${newRole.name}`, 'role_update').catch(() => null);

    await sendLog(newRole.guild, 'roleUpdate', {
      title: 'Role updated',
      description: `${newRole} was updated.`,
      targetId: newRole.id,
      fields
    });

    await handleAntiNukeEvent({
      guild: newRole.guild,
      actionType: permissionEscalation.escalated ? 'role_permission_escalation' : 'role_update',
      targetId: newRole.id,
      target: newRole,
      oldValue: oldRole,
      newValue: newRole,
      metadata: {
        targetType: 'role',
        targetName: newRole.name,
        permissionEscalation,
        hierarchyEscalation
      }
    }).catch(() => null);
  }
};