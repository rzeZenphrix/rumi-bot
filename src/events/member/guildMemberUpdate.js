const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { syncRoleConnections } = require('../../systems/automation/serverRoles');
const { syncBoosterState } = require('../../systems/boosterroles/store');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');

function roleDiff(oldMember, newMember) {
  const oldIds = new Set(oldMember.roles.cache.keys());
  const newIds = new Set(newMember.roles.cache.keys());

  const addedIds = [...newIds].filter((id) => !oldIds.has(id) && id !== newMember.guild.id);
  const removedIds = [...oldIds].filter((id) => !newIds.has(id) && id !== newMember.guild.id);

  const added = addedIds.map((id) => `<@&${id}>`);
  const removed = removedIds.map((id) => `<@&${id}>`);

  return {
    addedIds,
    removedIds,
    added,
    removed
  };
}

module.exports = {
  name: Events.GuildMemberUpdate,

  async execute(_client, oldMember, newMember) {
    const fields = [];

    if (oldMember.nickname !== newMember.nickname) {
      fields.push({
        name: 'Nickname',
        value: `Before: \`${oldMember.nickname || oldMember.user.username}\`\nAfter: \`${newMember.nickname || newMember.user.username}\``,
        inline: false
      });
    }

    const diff = roleDiff(oldMember, newMember);

    if (diff.added.length) {
      fields.push({
        name: 'Roles added',
        value: diff.added.join(', ').slice(0, 1024),
        inline: false
      });
    }

    if (diff.removed.length) {
      fields.push({
        name: 'Roles removed',
        value: diff.removed.join(', ').slice(0, 1024),
        inline: false
      });
    }

    await syncRoleConnections(oldMember, newMember).catch(() => null);
    await syncBoosterState(oldMember, newMember).catch(() => null);

    if (!fields.length) return;

    await sendLog(newMember.guild, 'memberUpdate', {
      title: 'Member updated',
      description: `${newMember} was updated.`,
      userId: newMember.id,
      member: newMember,
      fields,
      thumbnail: newMember.user.displayAvatarURL({ size: 256 })
    });

    if (diff.addedIds.length) {
      await handleAntiNukeEvent({
        guild: newMember.guild,
        actionType: 'member_role_add',
        targetId: newMember.id,
        target: newMember.user,
        oldValue: oldMember,
        newValue: newMember,
        metadata: {
          targetType: 'member',
          targetName: newMember.user.tag || newMember.user.username,
          roleIds: diff.addedIds
        }
      }).catch(() => null);
    }

    if (diff.removedIds.length) {
      await handleAntiNukeEvent({
        guild: newMember.guild,
        actionType: 'member_role_remove',
        targetId: newMember.id,
        target: newMember.user,
        oldValue: oldMember,
        newValue: newMember,
        metadata: {
          targetType: 'member',
          targetName: newMember.user.tag || newMember.user.username,
          roleIds: diff.removedIds
        }
      }).catch(() => null);
    }
  }
};
