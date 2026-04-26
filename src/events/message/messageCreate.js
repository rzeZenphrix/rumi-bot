const { Events } = require('discord.js');
const logger = require('../../systems/logging/logger');
const { handlePrefixCommand } = require('../../systems/prefix/commandHandler');
const { handleMessageCreate } = require('../../systems/automod/filters');
const { incrementFromContent } = require('../../systems/counters/wordCounter');
const { handleLevelXp } = require('../../systems/levels/levelEngine');

module.exports = {
  name: Events.MessageCreate,

  async execute(client, message) {
    if (!message.guild) return;
    if (message.author.bot) return;

    await handleLevelXp(client, message).catch(() => null);
    incrementFromContent(message.author.id, message.content);

    try {
      const handledCommand = await handlePrefixCommand(client, message);

      if (handledCommand) return;
    } catch (error) {
      logger.error(
        {
          error,
          guildId: message.guild?.id,
          channelId: message.channel?.id,
          userId: message.author?.id
        },
        'Prefix command pipeline failed'
      );
    }

    try {
      await handleMessageCreate(message);
    } catch (error) {
      logger.error(
        {
          error,
          guildId: message.guild?.id,
          channelId: message.channel?.id,
          userId: message.author?.id
        },
        'Automod pipeline failed'
      );
    }
  }
};