const { EmbedBuilder } = require('discord.js');
const {
  getGuildCustomization,
  hexToInt,
  DEFAULT_REPLY_COLORS,
  DEFAULT_REPLY_EMOJIS
} = require('../systems/customization/customizationStore');
const { sendWithGuildWebhook } = require('../systems/customization/webhookReplyManager');
const logger = require('../systems/logging/logger');

const DEFAULT_COLORS = {
  list: 0x2b2d31,
  info: 0x5865f2,
  good: 0x57f287,
  bad: 0xed4245,
  alert: 0xfee75c
};

function getTheme(guildId, type) {
  if (!guildId) {
    return {
      emoji: DEFAULT_REPLY_EMOJIS[type] || DEFAULT_REPLY_EMOJIS.info,
      color: DEFAULT_COLORS[type] || DEFAULT_COLORS.info
    };
  }

  const config = getGuildCustomization(guildId);

  return {
    emoji:
      config.replyEmojis?.[type] ||
      DEFAULT_REPLY_EMOJIS[type] ||
      DEFAULT_REPLY_EMOJIS.info,

    color: hexToInt(
      config.replyColors?.[type] || DEFAULT_REPLY_COLORS[type],
      DEFAULT_COLORS[type] || DEFAULT_COLORS.info
    )
  };
}

function buildDescription({ emoji, user, action, description, mentionUser }) {
  const body = String(description || action || '').trim();

  if (!body) return '';

  const shouldMention = mentionUser !== false && user;

  return `${emoji} ${shouldMention ? `${user}, ` : ''}${body}`;
}

function makeEmbed(type, user, action, options = {}) {
  const guildId =
    options.guildId ||
    options.message?.guild?.id ||
    options.guild?.id ||
    null;

  const theme = getTheme(guildId, type);

  const embed = new EmbedBuilder()
    .setColor(options.color || theme.color);

  if (options.allowTitle === true && options.title) {
    embed.setTitle(String(options.title).slice(0, 256));
  }

  const description = buildDescription({
    emoji: options.emoji || theme.emoji,
    user,
    action,
    description: options.description,
    mentionUser: options.mentionUser
  });

  if (description) {
    embed.setDescription(description.slice(0, 4096));
  }

  if (Array.isArray(options.fields) && options.fields.length) {
    embed.addFields(options.fields.slice(0, 25));
  }

  if (options.author) embed.setAuthor(options.author);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);
  if (options.footer) embed.setFooter(options.footer);

  return embed;
}

function buildPayload(type, user, action, options = {}) {
  if (options.plain === true) {
    return {
      content: options.content || action || '',
      files: options.files || [],
      components: options.components || [],
      allowedMentions: options.allowedMentions || { parse: [] }
    };
  }

  const embed = makeEmbed(type, user, action, options);

  return {
    content: options.content || undefined,
    embeds: [embed, ...(options.embeds || [])].filter(Boolean),
    files: options.files || [],
    components: options.components || [],
    allowedMentions:
      options.allowedMentions ||
      {
        users: user?.id ? [user.id] : [],
        roles: []
      }
  };
}

async function reply(message, type, action, options = {}) {
  const payload = buildPayload(type, options.user || message.author, action, {
    ...options,
    message,
    guildId: message.guild?.id
  });

  if (message.guild && options.useWebhook !== false) {
    const webhookResult = await sendWithGuildWebhook(message.channel, payload).catch(() => null);

    if (webhookResult) return webhookResult;
  }

  return message.channel.send(payload).catch((error) => {
    const code = Number(error?.code || error?.rawError?.code || 0);
    const status = Number(error?.status || 0);

    if (code === 50013 || status === 403) {
      logger.warn(
        {
          guildId: message.guild?.id,
          channelId: message.channel?.id,
          userId: message.author?.id
        },
        'Could not send response because Discord denied channel permissions'
      );

      return null;
    }

    throw error;
  });
}

async function send(channel, type, user, action, options = {}) {
  const payload = buildPayload(type, user, action, {
    ...options,
    guildId: channel.guild?.id
  });

  if (channel.guild && options.useWebhook !== false) {
    const webhookResult = await sendWithGuildWebhook(channel, payload).catch(() => null);

    if (webhookResult) return webhookResult;
  }

  return channel.send(payload).catch((error) => {
    const code = Number(error?.code || error?.rawError?.code || 0);
    const status = Number(error?.status || 0);

    if (code === 50013 || status === 403) {
      logger.warn(
        {
          guildId: channel.guild?.id,
          channelId: channel.id
        },
        'Could not send channel response because Discord denied channel permissions'
      );

      return null;
    }

    throw error;
  });
}

module.exports = {
  makeEmbed,
  buildPayload,
  reply,
  send
};
