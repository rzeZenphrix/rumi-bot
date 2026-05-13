const { Events } = require('discord.js');
const { sendLog } = require('../../systems/logging/logDispatcher');
const { handleAntiNukeEvent } = require('../../systems/antinuke/guard');
const { logEventError } = require('../../utils/discordErrors');

module.exports = {
  name: Events.GuildUpdate || 'guildUpdate',

  async execute(_client, oldGuild, newGuild) {
    const fields = [];

    if (oldGuild.name !== newGuild.name) {
      fields.push({
        name: 'Name',
        value: `Before: \`${oldGuild.name}\`\nAfter: \`${newGuild.name}\``,
        inline: false
      });
    }

    if (oldGuild.icon !== newGuild.icon) {
      fields.push({
        name: 'Icon',
        value: 'Changed',
        inline: true
      });
    }

    if (oldGuild.banner !== newGuild.banner) {
      fields.push({
        name: 'Banner',
        value: 'Changed',
        inline: true
      });
    }

    if (oldGuild.vanityURLCode !== newGuild.vanityURLCode) {
      fields.push({
        name: 'Vanity URL',
        value: `Before: \`${oldGuild.vanityURLCode || 'none'}\`\nAfter: \`${newGuild.vanityURLCode || 'none'}\``,
        inline: false
      });
    }

    if (!fields.length) return;

    await sendLog(newGuild, 'guildUpdate', {
      title: 'Server updated',
      description: 'Server settings were updated.',
      fields
    }).catch(() => null);

    await handleAntiNukeEvent({
      guild: newGuild,
      actionType: 'guild_update',
      targetId: newGuild.id,
      target: newGuild,
      oldValue: oldGuild,
      newValue: newGuild,
      metadata: {
        targetType: 'guild',
        targetName: newGuild.name
      }
    }).catch((error) => {
      logEventError({ eventName: 'guildUpdateAntinuke', guildId: newGuild.id }, error).catch(() => null);
    });
  }
};
