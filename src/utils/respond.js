const { EmbedBuilder, MessageFlags } = require('discord.js');
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
  info: 0xffffff,
  good: 0xffffff,
  bad: 0xed4245,
  error: 0xed4245,
  alert: 0xfee75c,
  warn: 0xfee75c,
  warning: 0xfee75c,
  add: 0xffffff,
  remove: 0xffffff
};

const FALLBACK_AUTO_EMOJIS = {
  bad: '❌',
  error: '❌',
  alert: '⚠️',
  warn: '⚠️',
  warning: '⚠️'
};

function normalizeType(type) {
  const raw = String(type || 'info').toLowerCase();

  if (raw === 'error') return 'bad';
  if (raw === 'warn' || raw === 'warning') return 'alert';

  return raw;
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function cleanText(value, max = null) {
  const text = String(value ?? '').trim();
  if (!max || text.length <= max) return text;
  return text.slice(0, max);
}

function safeEmbedColor(value, fallback = 0xffffff) {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffff) {
    return value;
  }

  if (Array.isArray(value) && value.length === 3) {
    const rgb = value.map(Number);
    if (rgb.every((x) => Number.isInteger(x) && x >= 0 && x <= 255)) return rgb;
  }

  if (typeof value === 'string') {
    const raw = value.trim();

    if (/^#?[0-9a-f]{6}$/i.test(raw)) {
      return Number.parseInt(raw.replace('#', ''), 16);
    }

    const number = Number(raw);
    if (Number.isInteger(number) && number >= 0 && number <= 0xffffff) return number;
  }

  return fallback;
}

function getTheme(guildId, type) {
  const normalizedType = normalizeType(type);
  const fallback = DEFAULT_COLORS[normalizedType] || DEFAULT_COLORS.info;

  if (!guildId) {
    return {
      color: fallback,
      config: null
    };
  }

  const config = getGuildCustomization(guildId);

  return {
    color: safeEmbedColor(
      hexToInt(
        config.replyColors?.[normalizedType] || DEFAULT_REPLY_COLORS?.[normalizedType],
        fallback
      ),
      fallback
    ),
    config
  };
}

function resolveEmoji(type, options = {}, config = null) {
  const normalizedType = normalizeType(type);

  const autoEmoji = hasOwn(options, 'autoEmoji')
    ? Boolean(options.autoEmoji)
    : ['bad', 'alert'].includes(normalizedType);

  // Manual emoji always wins. Passing emoji: '' intentionally disables it.
  if (hasOwn(options, 'emoji')) {
    return cleanText(options.emoji);
  }

  if (!autoEmoji) return '';

  return cleanText(
    config?.replyEmojis?.[normalizedType] ||
    DEFAULT_REPLY_EMOJIS?.[normalizedType] ||
    FALLBACK_AUTO_EMOJIS[normalizedType] ||
    ''
  );
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

function memberName(member) {
  return (
    member?.displayName ||
    member?.nickname ||
    member?.user?.globalName ||
    member?.user?.username ||
    member?.user?.tag ||
    null
  );
}

function memberAvatar(member) {
  return (
    member?.displayAvatarURL?.({ size: 128 }) ||
    member?.user?.displayAvatarURL?.({ size: 128 }) ||
    member?.user?.avatarURL?.({ size: 128 }) ||
    null
  );
}

function userName(user) {
  return user?.globalName || user?.username || user?.tag || user?.id || null;
}

function userAvatar(user) {
  return (
    user?.displayAvatarURL?.({ size: 128 }) ||
    user?.avatarURL?.({ size: 128 }) ||
    null
  );
}

function normalizeAuthor(author, message = null, fallbackUser = null) {
  if (!author) return null;

  // author: true means use the command author's server nickname/avatar.
  if (author === true) {
    const name = memberName(message?.member) || userName(fallbackUser);
    const iconURL = memberAvatar(message?.member) || userAvatar(fallbackUser);

    if (!name) return null;

    return {
      name: cleanText(name, 256),
      ...(iconURL ? { iconURL } : {})
    };
  }

  if (typeof author === 'string') {
    const name = cleanText(author, 256);
    return name ? { name } : null;
  }

  // GuildMember
  if (author.user) {
    const name = memberName(author);
    const iconURL = memberAvatar(author);

    if (!name) return null;

    return {
      name: cleanText(name, 256),
      ...(iconURL ? { iconURL } : {})
    };
  }

  // User
  if (author.username || author.globalName || author.tag) {
    const name = userName(author);
    const iconURL = userAvatar(author);

    if (!name) return null;

    return {
      name: cleanText(name, 256),
      ...(iconURL ? { iconURL } : {})
    };
  }

  // Manual object
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
  return (
    message?.member?.displayAvatarURL?.({ size: 128 }) ||
    user?.displayAvatarURL?.({ size: 128 }) ||
    user?.avatarURL?.({ size: 128 }) ||
    null
  );
}

function webhookIdentity(message, user, options = {}) {
  if (options.webhookIdentity === false) return null;

  return {
    username: options.webhookUsername || userDisplayNameFromMessage(message, user),
    avatarURL: options.webhookAvatarURL || userAvatarFromMessage(message, user)
  };
}

function normalizeAllowedMentions(user, options = {}) {
  if (options.allowedMentions) return options.allowedMentions;

  if (options.mentionUser === true && user?.id) {
    return {
      users: [user.id],
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

function applyEmbedVisuals(embed, options = {}, replyEmbed = {}, message = null, user = null) {
  const resolvedThumbnail =
    normalizeUrl(options.thumbnail) ||
    normalizeUrl(replyEmbed.thumbnailUrl) ||
    normalizeUrl(replyEmbed.thumbnail_url);

  if (resolvedThumbnail) {
    try {
      embed.setThumbnail(resolvedThumbnail);
    } catch {
      // ignore invalid thumbnail
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
      // ignore invalid image
    }
  }

  const author = normalizeAuthor(options.author, message, user);
  if (author) {
    try {
      embed.setAuthor(author);
    } catch {
      // ignore invalid author
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
      // ignore invalid footer
    }
  }
}

function makeEmbed(type, user, action, options = {}) {
  const embedOptions = hasOwn(options, 'author')
    ? options
    : { ...options, author: true };
  const normalizedType = normalizeType(type);
  const guildId =
    embedOptions.guildId ||
    embedOptions.message?.guild?.id ||
    embedOptions.guild?.id ||
    null;

  const { color, config } = getTheme(guildId, normalizedType);
  const customization = config || (guildId ? getGuildCustomization(guildId) : null);
  const replyEmbed = customization?.replyEmbed || {};

  const embed = new EmbedBuilder().setColor(safeEmbedColor(embedOptions.color, color));

  const resolvedTitle = embedOptions.title || replyEmbed.title;
  if (embedOptions.allowTitle !== false && resolvedTitle) {
    embed.setTitle(cleanText(resolvedTitle, 256));
  }

  const description = buildDescription({
    emoji: resolveEmoji(normalizedType, embedOptions, customization),
    action,
    description: embedOptions.description
  });

  if (description) {
    embed.setDescription(description.slice(0, 4096));
  }

  const fields = normalizeFields(embedOptions.fields);
  if (fields.length) {
    embed.addFields(fields);
  }

  applyEmbedVisuals(embed, embedOptions, replyEmbed, embedOptions.message, user);

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
  const normalizedType = normalizeType(type);
  const files = options.files || [];
  const components = options.components || [];
  const extraEmbeds = normalizeEmbeds(options.embeds);
  const guildId =
    options.guildId ||
    options.message?.guild?.id ||
    options.guild?.id ||
    null;

  const customization = guildId ? getGuildCustomization(guildId) : null;

  if (options.plain === true) {
    const emoji = resolveEmoji(normalizedType, options, customization);
    const baseContent = options.content !== undefined ? options.content : action;
    const content = withOptionalEmoji(baseContent, emoji);

    const payload = {
      content: content || '\u200B',
      files,
      components,
      allowedMentions: normalizeAllowedMentions(user, options)
    };

    const flags = buildInteractionFlags(options);
    if (flags !== undefined) payload.flags = flags;

    return payload;
  }

  const embed = makeEmbed(normalizedType, user, action, options);
  const embeds = embedHasContent(embed) ? [embed, ...extraEmbeds] : extraEmbeds;

  const payload = {
    content: options.content || undefined,
    embeds,
    files,
    components,
    allowedMentions: normalizeAllowedMentions(user, options)
  };

  const flags = buildInteractionFlags(options);
  if (flags !== undefined) payload.flags = flags;

  if (!payload.content && !payload.embeds.length && !payload.files.length && !payload.components.length) {
    payload.content = '\u200B';
  }

  return payload;
}

async function sendPayload(channel, payload, context = {}) {
  if (!channel?.send) {
    logger.warn(
      {
        guildId: context.guildId,
        channelId: context.channelId,
        userId: context.userId
      },
      'Could not send response because channel is missing'
    );

    return null;
  }

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