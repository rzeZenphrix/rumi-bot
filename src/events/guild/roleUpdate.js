const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { diffField, compactFields } = require('../../utils/logFields');

module.exports = {
  name: Events.GuildRoleUpdate || 'roleUpdate',
  async execute(_client, oldRole, newRole) {
    const fields = compactFields([
      diffField('Name', oldRole.name, newRole.name),
      diffField('Color', oldRole.hexColor, newRole.hexColor),
      diffField('Hoisted', oldRole.hoist, newRole.hoist),
      diffField('Mentionable', oldRole.mentionable, newRole.mentionable),
      diffField('Permissions bitfield', oldRole.permissions.bitfield.toString(), newRole.permissions.bitfield.toString(), false),
      { name: 'Role ID', value: `\`${newRole.id}\``, inline: true }
    ]);

    if (fields.length <= 1) return;

    await sendLog(newRole.guild, 'roleUpdate', {
      title: 'Role updated',
      description: `${newRole} was updated.`,
      targetId: newRole.id,
      fields
    });
  }
};
