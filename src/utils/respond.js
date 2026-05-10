const { EmbedBuilder, MessageFlags } = require('discord.js');
const {
  getGuildCustomization,
  hexToInt,
  DEFAULT_REPLY_COLORS
} = require('../systems/customization/customizationStore');
const { sendWithGuildWebhook } = require('../systems/customization/webhookReplyManager');
const logger = require('../systems/logging/logger');

const DEFAULT_COLORS = {
  list: 0x2b2d31,
  info: 0xffffff,
  good: 0xffffff,
  bad: 0xed4245,
  alert: 0xfee75c,
  add: 0xffffff,
  remove: 0xffffff
};

function getTheme(guildId, type) {
  if (!guildId) {
    return {
      color: DEFAULT_COLORS[type] || DEFAULT_COLORS.info
    };
  }

  const config = getGuildCustomization(guildId);

  return {
    color: hexToInt(
      config.replyColors?.[type] || DEFAULT_REPLY_COLORS?.[type],
      DEFAULT_COLORS[type] || DEFAULT_COLORS.info
    )
  };
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function cleanText(value, max = null) {
  const text = String(value ?? '').trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max);
}

function resolveEmoji(options = {}) {
  if (!hasOwn(options, 'emoji')) return '';
  return cleanText(options.emoji);
}

function withOptionalEmoji(text, emoji) {
  const body = cleanText(text);
  const icon = cleanText(emoji);

  if (!body) return icon;
  if (!icon) return body;

  return `${icon} ${body}`;
}

function normalizeUrl(value) {
  if (!value) return null;

  if (typeof value === 'string') {
    const url = value.trim();
    return url ? url : null;
  }

  if (typeof value === 'object') {
    const url = value.url || value.proxyURL || value.proxy_url || null;
    return url ? String(url).trim() : null;
  }

  return null;
}

function normalizeFooter(footer) {
  if (!footer) return null;

  if (typeof footer === 'string') {
    const text = cleanText(footer, 2048);
    return text ? { text } : null;
  }

  if (typeof footer === 'object') {
    const text = cleanText(footer.text || footer.footerText || footer.footer_text, 2048);
    const iconURL =
      footer.iconURL ||
      footer.iconUrl ||
      footer.icon_url ||
      footer.footerIconUrl ||
      footer.footer_icon_url ||
      undefined;

    if (!text) return null;

    return {
      text,
      ...(iconURL ? { iconURL: String(iconURL) } : {})
    };
  }

  return null;
}

function normalizeAuthor(author) {
  if (!author) return null;

  if (typeof author === 'string') {
    const name = cleanText(author, 256);
    return name ? { name } : null;
  }

  if (typeof author === 'object') {
    const name = cleanText(author.name || author.text, 256);
    const iconURL = author.iconURL || author.iconUrl || author.icon_url || undefined;
    const url = author.url || undefined;

    if (!name) return null;

    return {
      name,
      ...(iconURL ? { iconURL: String(iconURL) } : {}),
      ...(url ? { url: String(url) } : {})
    };
  }

  return null;
}

function normalizeFields(fields) {
  if (!Array.isArray(fields)) return [];

  return fields
    .filter((field) => field && field.name !== undefined && field.value !== undefined)
    .slice(0, 25)
    .map((field) => ({
      name: cleanText(field.name, 256) || '\u200B',
      value: cleanText(field.value, 1024) || '\u200B',
      inline: Boolean(field.inline)
    }));
}

function userDisplayNameFromMessage(message, user) {
  return (
    message?.member?.displayName ||
    user?.globalName ||
    user?.username ||
    user?.tag ||
    'User'
  );
}

function userAvatarFromMessage(message, user) {
  if (message?.member?.displayAvatarURL) {
    return message.member.displayAvatarURL({ size: 128 });
  }

  if (user?.displayAvatarURL) {
    return user.displayAvatarURL({ size: 128 });
  }

  if (user?.avatarURL) {
    return user.avatarURL({ size: 128 });
  }

  return null;
}

function webhookIdentity(message, user, options = {}) {
  if (options.webhookIdentity === false) return null;

  return {
    username: options.webhookUsername || userDisplayNameFromMessage(message, user),
    avatarURL: options.webhookAvatarURL || userAvatarFromMessage(message, user)
  };
}

function normalizeAllowedMentions(_user, options = {}) {
  if (options.allowedMentions) return options.allowedMentions;

  if (options.mentionUser === true && options.user?.id) {
    return {
      users: [options.user.id],
      roles: []
    };
  }

  return { parse: [] };
}

function buildDescription({ emoji, action, description }) {
  const rawBody = description !== undefined ? description : action;
  const body = cleanText(rawBody);

  if (!body && !emoji) return '';

  return withOptionalEmoji(body, emoji);
}

function applyEmbedVisuals(embed, options = {}, replyEmbed = {}) {
  const resolvedThumbnail =
    normalizeUrl(options.thumbnail) ||
    normalizeUrl(replyEmbed.thumbnailUrl) ||
    normalizeUrl(replyEmbed.thumbnail_url);

  if (resolvedThumbnail) {
    try {
      embed.setThumbnail(resolvedThumbnail);
    } catch {
      // Ignore invalid thumbnail URL.
    }
  }

  const resolvedImage =
    normalizeUrl(options.image) ||
    normalizeUrl(replyEmbed.imageUrl) ||
    normalizeUrl(replyEmbed.image_url);

  if (resolvedImage) {
    try {
      embed.setImage(resolvedImage);
    } catch {
      // Ignore invalid image URL.
    }
  }

  const author = normalizeAuthor(options.author);
  if (author) {
    try {
      embed.setAuthor(author);
    } catch {
      // Ignore invalid author payload.
    }
  }

  const footer =
    normalizeFooter(options.footer) ||
    normalizeFooter(
      replyEmbed.footerText || replyEmbed.footer_text
        ? {
            text: replyEmbed.footerText || replyEmbed.footer_text,
            iconURL: replyEmbed.footerIconUrl || replyEmbed.footer_icon_url || undefined
          }
        : null
    );

  if (footer) {
    try {
      embed.setFooter(footer);
    } catch {
      // Ignore invalid footer payload.
    }
  }
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

  const embed = new EmbedBuilder().setColor(options.color || theme.color);

  const resolvedTitle = options.title || replyEmbed.title;
  if (options.allowTitle !== false && resolvedTitle) {
    embed.setTitle(cleanText(resolvedTitle, 256));
  }

  const description = buildDescription({
    emoji: resolveEmoji(options),
    user,
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

  applyEmbedVisuals(embed, options, replyEmbed);

  return embed;
}

function embedHasContent(embed) {
  const json = embed.toJSON();

  return Boolean(
    json.title ||
    json.description ||
    json.fields?.length ||
    json.image ||
    json.thumbnail ||
    json.author ||
    json.footer
  );
}

function normalizeEmbeds(embeds) {
  if (!Array.isArray(embeds)) return [];
  return embeds.filter(Boolean).slice(0, 10);
}

function buildInteractionFlags(options = {}) {
  if (options.flags !== undefined) return options.flags;
  if (options.ephemeral === true) return MessageFlags.Ephemeral;
  return undefined;
}

function buildPayload(type, user, action, options = {}) {
  const files = options.files || [];
  const components = options.components || [];
  const extraEmbeds = normalizeEmbeds(options.embeds);

  if (options.plain === true) {
    const emoji = resolveEmoji(options);
    const baseContent = options.content !== undefined ? options.content : action;
    const content = withOptionalEmoji(baseContent, emoji);

    const payload = {
      content: content || '\u200B',
      files,
      components,
      allowedMentions: options.allowedMentions || { parse: [] }
    };

    const flags = buildInteractionFlags(options);
    if (flags !== undefined) payload.flags = flags;

    return payload;
  }

  const embed = makeEmbed(type, user, action, options);
  const embeds = embedHasContent(embed) ? [embed, ...extraEmbeds] : extraEmbeds;

  const payload = {
    content: options.content || undefined,
    embeds,
    files,
    components,
    allowedMentions: normalizeAllowedMentions(user, { ...options, user })
  };

  const flags = buildInteractionFlags(options);
  if (flags !== undefined) payload.flags = flags;

  if (!payload.content && !payload.embeds.length && !payload.files.length && !payload.components.length) {
    payload.content = '\u200B';
  }

  return payload;
}

async function sendPayload(channel, payload, context = {}) {
  return channel.send(payload).catch((error) => {
    const code = Number(error?.code || error?.rawError?.code || 0);
    const status = Number(error?.status || 0);

    if (code === 50013 || status === 403) {
      logger.warn(
        {
          guildId: context.guildId,
          channelId: context.channelId,
          userId: context.userId
        },
        'Could not send response because Discord denied channel permissions'
      );

      return null;
    }

    throw error;
  });
}

async function reply(message, type, action, options = {}) {
  const user = options.user || message.author;

  const payload = buildPayload(type, user, action, {
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
    const identity = webhookIdentity(message, user, options);
    const webhookResult = await sendWithGuildWebhook(message.channel, payload, identity).catch(() => null);
    if (webhookResult) return webhookResult;
  }

  return sendPayload(message.channel, payload, {
    guildId: message.guild?.id,
    channelId: message.channel?.id,
    userId: message.author?.id
  });
}

async function send(channel, type, user, action, options = {}) {
  const payload = buildPayload(type, user, action, {
    ...options,
    guildId: channel.guild?.id
  });

  if (channel.guild && options.useWebhook !== false) {
    const identity = options.message
      ? webhookIdentity(options.message, user, options)
      : null;

    const webhookResult = await sendWithGuildWebhook(channel, payload, identity).catch(() => null);
    if (webhookResult) return webhookResult;
  }

  return sendPayload(channel, payload, {
    guildId: channel.guild?.id,
    channelId: channel.id,
    userId: user?.id
  });
}

module.exports = {
  makeEmbed,
  buildPayload,
  reply,
  send
};