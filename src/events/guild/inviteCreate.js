const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { handleInviteCreate } = require('../../systems/antiraid/inviteTracker');

module.exports = {
  name: Events.InviteCreate || 'inviteCreate',

  async execute(_client, invite) {
    if (!invite.guild) return;

    await sendLog(invite.guild, 'inviteCreate', {
      title: 'Invite created',
      description: `Invite \`${invite.code}\` was created.`,
      channelId: invite.channel?.id,
      fields: [
        { name: 'Code', value: `\`${invite.code}\``, inline: true },
        { name: 'Channel', value: invite.channel ? `${invite.channel}` : 'Unknown', inline: true },
        { name: 'Max uses', value: String(invite.maxUses || 'Unlimited'), inline: true }
      ]
    }).catch(() => null);

    await handleInviteCreate(invite).catch((error) => {
      console.error('[ANTI-RAID INVITE CREATE CACHE ERROR]', error);
    });

    await handleAntiNukeEvent({
      guild: invite.guild,
      actionType: 'invite_create',
      targetId: invite.code,
      target: invite,
      newValue: invite,
      metadata: {
        targetType: 'invite',
        targetName: invite.code
      }
    }).catch(() => null);
  }
};