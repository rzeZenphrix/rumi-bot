const { EmbedBuilder } = require('discord.js');
const {
  getGuildCustomization,
  hexToInt,
  DEFAULT_REPLY_COLORS,
  DEFAULT_REPLY_EMOJIS
} = require('../systems/customization/customizationStore');

const DEFAULT_COLORS = {
  list: 0x2b2d31,
  info: 0x5865f2,
  good: 0x57f287,
  bad: 0xed4245,
  alert: 0xfee75c
};

async function getTheme(guildId, type) {
  if (!guildId) {
    return {
      emoji: DEFAULT_REPLY_EMOJIS[type] || DEFAULT_REPLY_EMOJIS.info,
      color: DEFAULT_COLORS[type] || DEFAULT_COLORS.info
    };
  }

  const config = await getGuildCustomization(guildId).catch(() => null);

  return {
    emoji:
      config?.replyEmojis?.[type] ||
      DEFAULT_REPLY_EMOJIS[type] ||
      DEFAULT_REPLY_EMOJIS.info,

    color: hexToInt(
      config?.replyColors?.[type] || DEFAULT_REPLY_COLORS[type],
      DEFAULT_COLORS[type] || DEFAULT_COLORS.info
    )
  };
}

function cleanText(text) {
  return String(text || '').trim();
}

async function makeEmbed(type, user, action, options = {}) {
  const guildId =
    options.guildId ||
    options.message?.guild?.id ||
    options.guild?.id ||
    null;

  const theme = await getTheme(guildId, type);

  const embed = new EmbedBuilder()
    .setColor(options.color || theme.color);

  const body = cleanText(options.description || action);
  const emoji = options.emoji === false ? '' : options.emoji || theme.emoji;

  if (body) {
    const mention =
      options.mentionUser === true && user
        ? `${user}, `
        : '';

    embed.setDescription(`${emoji ? `${emoji} ` : ''}${mention}${body}`.slice(0, 4096));
  }

  if (Array.isArray(options.fields) && options.fields.length) {
    embed.addFields(options.fields.slice(0, 25));
  }

  if (options.author) embed.setAuthor(options.author);
  if (options.thumbnail) embed.setThumbnail(options.thumbnail);
  if (options.image) embed.setImage(options.image);

  return embed;
}

async function buildPayload(type, user, action, options = {}) {
  if (options.plain === true) {
    return {
      content: options.content || action || '',
      files: options.files || [],
      components: options.components || [],
      allowedMentions: options.allowedMentions || { parse: [] }
    };
  }

  const embed = await makeEmbed(type, user, action, options);

  return {
    content: options.content || undefined,
    embeds: [embed, ...(options.embeds || [])].filter(Boolean),
    files: options.files || [],
    components: options.components || [],
    allowedMentions:
      options.allowedMentions ||
      {
        parse: []
      }
  };
}

async function reply(message, type, action, options = {}) {
  const payload = await buildPayload(type, options.user || message.author, action, {
    ...options,
    message,
    guildId: message.guild?.id
  });

  return message.channel.send(payload);
}

async function send(channel, type, user, action, options = {}) {
  const payload = await buildPayload(type, user, action, {
    ...options,
    guildId: channel.guild?.id
  });

  return channel.send(payload);
}

module.exports = {
  makeEmbed,
  buildPayload,
  reply,
  send
};