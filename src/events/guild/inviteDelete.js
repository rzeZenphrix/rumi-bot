const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { handleInviteDelete } = require('../../systems/antiraid/inviteTracker');

module.exports = {
  name: Events.InviteDelete || 'inviteDelete',

  async execute(_client, invite) {
    if (!invite.guild) return;

    await sendLog(invite.guild, 'inviteDelete', {
      title: 'Invite deleted',
      description: `Invite \`${invite.code}\` was deleted.`,
      channelId: invite.channel?.id,
      fields: [
        { name: 'Code', value: `\`${invite.code}\``, inline: true },
        { name: 'Channel', value: invite.channel ? `${invite.channel}` : 'Unknown', inline: true }
      ]
    }).catch(() => null);

    await handleInviteDelete(invite).catch((error) => {
      console.error('[ANTI-RAID INVITE DELETE CACHE ERROR]', error);
    });

    await handleAntiNukeEvent({
      guild: invite.guild,
      actionType: 'invite_delete',
      targetId: invite.code,
      target: invite,
      oldValue: invite,
      metadata: {
        targetType: 'invite',
        targetName: invite.code
      }
    }).catch(() => null);
  }
};