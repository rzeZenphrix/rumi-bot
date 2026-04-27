const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { syncRoleConnections } = require('../../systems/automation/serverRoles');

function roleDiff(oldMember, newMember) {
  const oldIds = new Set(oldMember.roles.cache.keys());
  const newIds = new Set(newMember.roles.cache.keys());
  const added = [...newIds].filter((id) => !oldIds.has(id) && id !== newMember.guild.id).map((id) => `<@&${id}>`);
  const removed = [...oldIds].filter((id) => !newIds.has(id) && id !== newMember.guild.id).map((id) => `<@&${id}>`);
  return { added, removed };
}

module.exports = {
  name: Events.GuildMemberUpdate,
  async execute(_client, oldMember, newMember) {
    const fields = [];

    if (oldMember.nickname !== newMember.nickname) {
      fields.push({ name: 'Nickname', value: `Before: \`${oldMember.nickname || oldMember.user.username}\`\nAfter: \`${newMember.nickname || newMember.user.username}\``, inline: false });
    }

    const diff = roleDiff(oldMember, newMember);
    if (diff.added.length) fields.push({ name: 'Roles added', value: diff.added.join(', '), inline: false });
    if (diff.removed.length) fields.push({ name: 'Roles removed', value: diff.removed.join(', '), inline: false });

    if (!fields.length) return;

    await syncRoleConnections(oldMember, newMember).catch(() => null);

    await sendLog(newMember.guild, 'memberUpdate', {
      title: 'Member updated',
      description: `${newMember} was updated.`,
      userId: newMember.id,
      member: newMember,
      fields,
      thumbnail: newMember.user.displayAvatarURL({ size: 256 })
    });
  }
};
