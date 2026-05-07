const { Events } = require('discord.js');
const logger = require('../../systems/logging/logger');
const { handlePrefixCommand } = require('../../systems/prefix/commandHandler');
const { handleMessageCreate } = require('../../systems/automod/filters');
const { incrementFromContent } = require('../../systems/counters/wordCounter');
const { handleLevelXp } = require('../../systems/levels/levelEngine');
const { clearAfkForMessage, handleAfkMentions } = require('../../systems/afk/manager');
const { handleMessageAutomation } = require('../../systems/automation/messageAutomation');
const { recordMessage } = require('../../systems/analytics/serverAnalytics');
const { handleStickyMessages } = require('../../systems/messages/guildMessages');
const { handleAntiRaidMessage } = require('../../systems/antiraid/guard');
const { handleDisboardBumpMessage } = require('../../systems/bump/disboardBumpReminder');

module.exports = {
  name: Events.MessageCreate,

  async execute(client, message) {
    if (message.author.bot) {
      await handleDisboardBumpMessage(message).catch((error) => {
        logger.warn({ error, guildId: message.guild?.id, messageId: message.id }, 'Disboard bump detector failed');
      });
      return;
    }

    if (!message.guild) {
      try {
        await handlePrefixCommand(client, message);
      } catch (error) {
        logger.error(
          {
            error,
            channelId: message.channel?.id,
            userId: message.author?.id
          },
          'DM prefix command pipeline failed'
        );
      }
      return;
    }

    await handleAntiRaidMessage(message).catch((error) => {
      console.error('[ANTI-RAID MESSAGE ERROR]', error);
    });

    await handleLevelXp(client, message).catch(() => null);
    await incrementFromContent(message.author.id, message.content).catch(() => null);
    await recordMessage(message.guild.id, message.channel.id, message.author.id).catch(() => null);

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

    await clearAfkForMessage(message).catch(() => null);

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

    await handleMessageAutomation(message).catch(() => null);
    await handleStickyMessages(message).catch(() => null);
    await handleAfkMentions(message).catch(() => null);
  }
};
