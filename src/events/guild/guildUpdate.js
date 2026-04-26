const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { diffField, compactFields } = require('../../utils/logFields');

module.exports = {
  name: Events.GuildUpdate,
  async execute(_client, oldGuild, newGuild) {
    const fields = compactFields([
      diffField('Name', oldGuild.name, newGuild.name),
      diffField('Description', oldGuild.description, newGuild.description, false),
      diffField('Verification level', oldGuild.verificationLevel, newGuild.verificationLevel),
      diffField('AFK channel', oldGuild.afkChannelId, newGuild.afkChannelId),
      { name: 'Guild ID', value: `\`${newGuild.id}\``, inline: true }
    ]);

    if (fields.length <= 1) return;

    await sendLog(newGuild, 'guildUpdate', {
      title: 'Server updated',
      description: 'Server settings changed.',
      fields,
      thumbnail: newGuild.iconURL?.({ size: 256 }) || undefined
    });
  }
};
