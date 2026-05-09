const { EmbedBuilder } = require('discord.js');
const {
  getGuildCustomization,
  hexToInt,
  DEFAULT_REPLY_COLORS,
  DEFAULT_REPLY_EMOJIS
} = require('../systems/customization/customizationStore');
const { sendWithGuildWebhook } = require('../systems/customization/webhookReplyManager');
const logger = require('../systems/logging/logger');

const DEFAULT_EMBED_COLOR = 0xc8d8f2;
const ERROR_EMBED_COLOR = 0xed4245;

const DEFAULT_COLORS = {
  list: DEFAULT_EMBED_COLOR,
  info: DEFAULT_EMBED_COLOR,
  good: DEFAULT_EMBED_COLOR,
  bad: ERROR_EMBED_COLOR,
  alert: DEFAULT_EMBED_COLOR
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

function displayAvatarUrl(entity) {
  if (!entity?.displayAvatarURL) return undefined;

  try {
    return entity.displayAvatarURL({ size: 64 });
  } catch {
    return entity.displayAvatarURL();
  }
}

function defaultAuthor(user, options = {}) {
  const member = options.member || options.message?.member || null;
  const authorUser = member?.user || user;
  const name =
    member?.displayName ||
    member?.nick ||
    user?.globalName ||
    user?.displayName ||
    user?.username ||
    user?.tag ||
    null;

  if (!name && !authorUser) return null;

  return {
    name: String(name || 'Rumi user').slice(0, 256),
    iconURL: displayAvatarUrl(member) || displayAvatarUrl(authorUser)
  };
}

function buildDescription({ emoji, action, description }) {
  const body = String(description || action || '').trim();

  if (!body) return '';

  return `${emoji} ${body}`;
}

function startsWithKnownReplyEmoji(text = '') {
  const value = String(text || '').trim();
  return Object.values(DEFAULT_REPLY_EMOJIS).some((emoji) => emoji && value.startsWith(emoji));
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];

  return fields
    .map((field) => {
      if (!field) return null;

      const name = field.name ?? field.id ?? field.label;
      const value = field.value;
      if (name === undefined || value === undefined) return null;

      return {
        name: String(name).slice(0, 256) || '\u200B',
        value: String(value).slice(0, 1024) || '\u200B',
        inline: Boolean(field.inline)
      };
    })
    .filter(Boolean)
    .slice(0, 25);
}

function makeEmbed(type, user, action, options = {}) {
  const guildId =
    options.guildId ||
    options.message?.guild?.id ||
    options.guild?.id ||
    null;

  const theme = getTheme(guildId, type);
  const customization = guildId ? getGuildCustomization(guildId) : null;
  const replyEmbed = customization?.replyEmbed || {};

  const embed = new EmbedBuilder()
    .setColor(options.color || theme.color);

  const resolvedTitle = options.title || replyEmbed.title;
  if (options.allowTitle !== false && resolvedTitle) {
    embed.setTitle(String(resolvedTitle).slice(0, 256));
  }

  const description = buildDescription({
    emoji: options.emoji || theme.emoji,
    action,
    description: options.description
  });

  if (description) {
    embed.setDescription(description.slice(0, 4096));
  }

  const fields = normalizeFields(options.fields);
  if (fields.length) {
    embed.addFields(fields);
  }

  const author = options.author || (options.author !== false ? defaultAuthor(user, options) : null);
  if (author) embed.setAuthor(author);

  const resolvedThumbnail = options.thumbnail || replyEmbed.thumbnailUrl || replyEmbed.thumbnail_url;
  if (resolvedThumbnail) embed.setThumbnail(resolvedThumbnail);

  const resolvedImage = options.image || replyEmbed.imageUrl || replyEmbed.image_url;
  if (resolvedImage) embed.setImage(resolvedImage);

  const resolvedFooter =
    options.footer ||
    (replyEmbed.footerText || replyEmbed.footer_text
      ? {
          text: String(replyEmbed.footerText || replyEmbed.footer_text).slice(0, 2048),
          iconURL: replyEmbed.footerIconUrl || replyEmbed.footer_icon_url || undefined
        }
      : null);
  if (resolvedFooter) embed.setFooter(resolvedFooter);

  return embed;
}

function styleEmbed(embedLike, type = 'info', user = null, options = {}) {
  const embed = embedLike instanceof EmbedBuilder
    ? embedLike
    : EmbedBuilder.from(embedLike || {});
  const guildId =
    options.guildId ||
    options.message?.guild?.id ||
    options.guild?.id ||
    null;
  const theme = getTheme(guildId, type);
  const json = embed.toJSON();

  embed.setColor(options.color || (type === 'bad' || type === 'error' ? ERROR_EMBED_COLOR : theme.color));

  if (options.author !== false) {
    const author = options.author || defaultAuthor(user, options);
    if (author) embed.setAuthor(author);
  }

  if (options.prefixEmoji !== false && json.description) {
    const description = String(json.description);
    if (!startsWithKnownReplyEmoji(description)) {
      embed.setDescription(`${options.emoji || theme.emoji} ${description}`.slice(0, 4096));
    }
  }

  return embed;
}

function stylePayload(type, user, payload = {}, options = {}) {
  const styled = { ...payload };
  const embeds = Array.isArray(payload.embeds) ? payload.embeds : [];

  if (embeds.length) {
    styled.embeds = embeds.map((embed) => styleEmbed(embed, type, user, options));
  }

  styled.allowedMentions = payload.allowedMentions || { parse: [] };
  return styled;
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
      { parse: [] }
  };
}

async function reply(message, type, action, options = {}) {
  const payload = buildPayload(type, options.user || message.author, action, {
    ...options,
    message,
    guildId: message.guild?.id
  });

  if (message.interaction?.isChatInputCommand?.()) {
    if (message.interaction.deferred && !message.interaction.replied) {
      await message.interaction.editReply(payload).catch(() => null);
      return message.interaction.fetchReply().catch(() => null);
    }

    if (message.interaction.replied) {
      return message.interaction.followUp(payload).catch(() => null);
    }

    await message.interaction.reply(payload).catch(() => null);
    return message.interaction.fetchReply().catch(() => null);
  }

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
  styleEmbed,
  stylePayload,
  DEFAULT_EMBED_COLOR,
  ERROR_EMBED_COLOR,
  reply,
  send
};
