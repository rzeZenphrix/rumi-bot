const { findRoleForReaction } = require('../../systems/reactionroles/store');
const { Events } = require('discord.js');
const { handleVerificationReaction } = require('../../systems/verification/verificationManager');
const { handleGiveawayReaction } = require('../../systems/giveaways/manager');

module.exports = {
  name: Events.MessageReactionAdd || 'messageReactionAdd',

  async execute(_client, reaction, user) {
    if (await handleVerificationReaction(reaction, user).catch(() => false)) {
      return;
    }

    const guild = reaction.message.guild;
    if (!guild) return;

    if (await handleGiveawayReaction(_client, reaction, user).catch(() => false)) {
      return;
    }

    const roleId = await findRoleForReaction(guild.id, reaction.message.id, reaction.emoji);
    if (!roleId) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return;
    await member.roles.add(roleId, 'Reaction role add').catch(() => null);
  }
};
