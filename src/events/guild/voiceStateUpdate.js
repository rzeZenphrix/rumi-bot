const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleVoiceStateTransition } = require('../../systems/analytics/serverAnalytics');

module.exports = {
  name: Events.VoiceStateUpdate || 'voiceStateUpdate',
  async execute(_client, oldState, newState) {
    const guild = newState.guild || oldState.guild;
    const member = newState.member || oldState.member;
    if (!guild || !member) return;

    await handleVoiceStateTransition(oldState, newState).catch(() => null);

    const oldChannel = oldState.channelId;
    const newChannel = newState.channelId;
    const fields = [];
    let title = 'Voice state updated';

    if (oldChannel !== newChannel) {
      title = !oldChannel ? 'Voice channel joined' : !newChannel ? 'Voice channel left' : 'Voice channel moved';
      fields.push({ name: 'Before', value: oldChannel ? `<#${oldChannel}>` : 'None', inline: true });
      fields.push({ name: 'After', value: newChannel ? `<#${newChannel}>` : 'None', inline: true });
    }

    if (oldState.serverMute !== newState.serverMute) fields.push({ name: 'Server mute', value: `${oldState.serverMute ? 'Yes' : 'No'} → ${newState.serverMute ? 'Yes' : 'No'}`, inline: true });
    if (oldState.serverDeaf !== newState.serverDeaf) fields.push({ name: 'Server deaf', value: `${oldState.serverDeaf ? 'Yes' : 'No'} → ${newState.serverDeaf ? 'Yes' : 'No'}`, inline: true });

    if (!fields.length) return;

    await sendLog(guild, 'voiceStateUpdate', {
      title,
      description: `${member} voice state changed.`,
      userId: member.id,
      member,
      channelId: newChannel || oldChannel,
      fields,
      thumbnail: member.user.displayAvatarURL({ size: 256 })
    });
  }
};
