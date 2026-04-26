const { findRoleForReaction } = require('../../systems/reactionroles/store');

module.exports = {
  name: 'messageReactionRemove',
  async execute(_client, reaction, user) {
    if (user.bot) return;
    if (reaction.partial) reaction = await reaction.fetch().catch(() => reaction);
    const guild = reaction.message.guild;
    if (!guild) return;
    const roleId = findRoleForReaction(guild.id, reaction.message.id, reaction.emoji);
    if (!roleId) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.remove(roleId, 'Reaction role remove').catch(() => null);
  }
};
