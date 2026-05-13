const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} = require('discord.js');

const respond = require('../../utils/respond');
const emojis = require('../../utils/botEmojis');

const ACCENT_COLOR = 0xc8d8f2;
const ROLE_LIMIT = 250;
const CHANNEL_LIMIT = 500;

function clean(value, fallback = 'n/a') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function truncate(value, max = 3900) {
  const text = clean(value, '\u200B');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function number(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric.toLocaleString() : '0';
}

function icon(name) {
  return String(emojis?.[name] || '').trim();
}

function withIcon(name, text) {
  const emoji = icon(name);
  return emoji ? `${emoji} ${text}` : text;
}

function text(content) {
  return new TextDisplayBuilder().setContent(truncate(content));
}

function separator(large = false, divider = true) {
  const sep = new SeparatorBuilder().setDivider(divider);

  if (typeof sep.setSpacing === 'function' && SeparatorSpacingSize) {
    sep.setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small);
  }

  return sep;
}

function safeSetEmoji(button, emoji) {
  const value = String(emoji || '').trim();
  if (!value) return button;

  try {
    button.setEmoji(value);
  } catch {
    // Invalid emoji should not break the command.
  }

  return button;
}

function imageUrl(factory) {
  try {
    return factory() || null;
  } catch {
    return null;
  }
}

function formatCap(current, limit) {
  if (!limit) return number(current);
  return `${number(current)}/${number(limit)}`;
}

function premiumTierLabel(tier) {
  const raw = String(tier ?? '0');

  if (tier === 0 || raw === '0' || raw === 'None') return 'None';
  if (tier === 1 || raw.includes('Tier1')) return 'Level 1';
  if (tier === 2 || raw.includes('Tier2')) return 'Level 2';
  if (tier === 3 || raw.includes('Tier3')) return 'Level 3';

  return clean(raw, 'None');
}

function verificationLabel(level) {
  const map = {
    0: 'None',
    1: 'Low',
    2: 'Medium',
    3: 'High',
    4: 'Very High',
    None: 'None',
    Low: 'Low',
    Medium: 'Medium',
    High: 'High',
    VeryHigh: 'Very High'
  };

  return map[level] || map[String(level)] || clean(level);
}

function formatFeatureName(feature) {
  return String(feature || '')
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function channelBreakdown(channels) {
  const counts = {
    text: 0,
    voice: 0,
    stage: 0,
    forum: 0,
    announcement: 0,
    category: 0,
    thread: 0
  };

  for (const channel of channels.values()) {
    switch (channel.type) {
      case ChannelType.GuildText:
        counts.text += 1;
        break;
      case ChannelType.GuildVoice:
        counts.voice += 1;
        break;
      case ChannelType.GuildStageVoice:
        counts.stage += 1;
        break;
      case ChannelType.GuildForum:
        counts.forum += 1;
        break;
      case ChannelType.GuildAnnouncement:
        counts.announcement += 1;
        break;
      case ChannelType.GuildCategory:
        counts.category += 1;
        break;
      case ChannelType.PublicThread:
      case ChannelType.PrivateThread:
      case ChannelType.AnnouncementThread:
        counts.thread += 1;
        break;
      default:
        break;
    }
  }

  return counts;
}

async function fetchCollection(fetcher, fallback) {
  try {
    const result = await fetcher();
    return result || fallback;
  } catch {
    return fallback;
  }
}

async function getMemberBreakdown(guild) {
  let members = guild.members.cache;
  let full = false;

  // Avoid forcing huge member fetches. For larger guilds, cached numbers are safer.
  if (guild.memberCount <= 5000) {
    try {
      members = await guild.members.fetch();
      full = members.size >= guild.memberCount;
    } catch {
      full = false;
    }
  }

  const bots = members.filter((member) => member.user?.bot).size;
  const humans = members.filter((member) => !member.user?.bot).size;

  return {
    bots,
    humans,
    total: guild.memberCount,
    full
  };
}

function buildLinkRow({ guildId, iconUrl, bannerUrl, splashUrl, featuresCount }) {
  const buttons = [];

  buttons.push(
    new ButtonBuilder()
      .setCustomId(`serverinfo:features:${guildId}`)
      .setLabel(`${featuresCount} Features`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );

  if (iconUrl) {
    const btn = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Icon')
      .setURL(iconUrl);

    safeSetEmoji(btn, icon('up'));
    buttons.push(btn);
  }

  if (bannerUrl) {
    const btn = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Banner')
      .setURL(bannerUrl);

    safeSetEmoji(btn, icon('up'));
    buttons.push(btn);
  }

  if (splashUrl) {
    const btn = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Splash')
      .setURL(splashUrl);

    safeSetEmoji(btn, icon('up'));
    buttons.push(btn);
  }

  if (!buttons.length) return null;

  return new ActionRowBuilder().addComponents(buttons.slice(0, 5));
}

function makePayload(container) {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  };
}

async function buildServerInfoPayload(message) {
  const g = await message.guild.fetch();

  const [owner, channels, roles, emojisCollection, stickers, memberBreakdown] = await Promise.all([
    g.fetchOwner().catch(() => null),
    fetchCollection(() => g.channels.fetch(), g.channels.cache),
    fetchCollection(() => g.roles.fetch(), g.roles.cache),
    fetchCollection(() => g.emojis.fetch(), g.emojis.cache),
    fetchCollection(() => g.stickers.fetch(), g.stickers?.cache),
    getMemberBreakdown(g)
  ]);

  const iconUrl = imageUrl(() => g.iconURL({ size: 512, extension: 'png' }));
  const bannerUrl = imageUrl(() => g.bannerURL({ size: 1024, extension: 'png' }));
  const splashUrl = imageUrl(() => g.splashURL({ size: 1024, extension: 'png' }));

  const createdUnix = Math.floor(g.createdTimestamp / 1000);
  const channelCounts = channelBreakdown(channels);

  const boosts = g.premiumSubscriptionCount ?? 0;
  const boostLevel = premiumTierLabel(g.premiumTier);

  const features = Array.isArray(g.features) ? g.features : [];
  const featurePreview = features.length
    ? features.slice(0, 8).map(formatFeatureName).join(', ')
    : 'None';

  const ownerLabel = owner?.user
    ? `${owner.user.tag} (<@${owner.id}>)`
    : `<@${g.ownerId}>`;

  const memberHumanLabel = memberBreakdown.full ? 'Humans' : 'Known Humans';
  const memberBotLabel = memberBreakdown.full ? 'Bots' : 'Known Bots';

  const serverDescription = g.description ||
    'No server description has been set for this server yet.';

  const shardId = message.guild.shardId ?? message.client.shard?.ids?.[0] ?? 0;
  const clusterLabel = process.env.CLUSTER_ID ? ` Cluster ${process.env.CLUSTER_ID}` : '';

  const emojiLimit = g.emojiLimit || null;
  const stickerLimit = g.stickerLimit || null;

  const container = new ContainerBuilder().setAccentColor(ACCENT_COLOR);

  if (bannerUrl || splashUrl) {
    container.addMediaGalleryComponents((gallery) =>
      gallery.addItems((item) =>
        item
          .setURL(bannerUrl || splashUrl)
          .setDescription(`${g.name} server banner`)
      )
    );
  }

  if (iconUrl) {
    container.addSectionComponents((section) =>
      section
        .addTextDisplayComponents((display) =>
          display.setContent([
            `# ${withIcon('info', `${g.name} — Server Information`)}`,
            '',
            serverDescription,
            '',
            `> Created <t:${createdUnix}:R> • ${number(g.memberCount)} members`
          ].join('\n'))
        )
        .setThumbnailAccessory((thumbnail) =>
          thumbnail
            .setURL(iconUrl)
            .setDescription(`${g.name} server icon`)
        )
    );
  } else {
    container.addTextDisplayComponents(text([
      `# ${withIcon('info', `${g.name} — Server Information`)}`,
      '',
      serverDescription,
      '',
      `> Created <t:${createdUnix}:R> • ${number(g.memberCount)} members`
    ].join('\n')));
  }

  container
    .addSeparatorComponents(separator(true))
    .addTextDisplayComponents(text([
      `## Server Info`,
      `• **Owner:** ${ownerLabel}`,
      `• **Created:** <t:${createdUnix}:F>`,
      `• **ID:** \`${g.id}\``
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      `## General Info`,
      `• **${memberHumanLabel}:** ${number(memberBreakdown.humans)}`,
      `• **${memberBotLabel}:** ${number(memberBreakdown.bots)}`,
      `• **Total Members:** ${number(memberBreakdown.total)}`,
      `• **Boost Level:** ${boostLevel} (${number(boosts)} Boost${boosts === 1 ? '' : 's'})`
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      `## Channel Info`,
      `• **Channels:** ${formatCap(channels.size, CHANNEL_LIMIT)}`,
      `• **Text:** ${number(channelCounts.text)} | **Voice:** ${number(channelCounts.voice)} | **Stage:** ${number(channelCounts.stage)}`,
      `• **Forum:** ${number(channelCounts.forum)} | **Announcement:** ${number(channelCounts.announcement)} | **Categories:** ${number(channelCounts.category)}`
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(text([
      `## Other Info`,
      `• **Verification:** ${verificationLabel(g.verificationLevel)}`,
      `• **Roles:** ${formatCap(roles.size, ROLE_LIMIT)}`,
      `• **Emojis:** ${formatCap(emojisCollection.size, emojiLimit)}`,
      `• **Stickers:** ${formatCap(stickers?.size || 0, stickerLimit)}`,
      `• **Features:** ${featurePreview}`
    ].join('\n')))
    .addSeparatorComponents(separator());

  const row = buildLinkRow({
    guildId: g.id,
    iconUrl,
    bannerUrl,
    splashUrl,
    featuresCount: features.length
  });

  if (row) {
    container.addActionRowComponents(row);
  }

  container
    .addSeparatorComponents(separator(false, false))
    .addTextDisplayComponents(text(
      `${withIcon('info', `${g.name} is running on shard ${shardId}${clusterLabel ? ` (${clusterLabel})` : ''}`)}`
    ));

  return makePayload(container);
}

async function sendLegacyServerInfo(message) {
  const g = await message.guild.fetch();
  const createdUnix = Math.floor(g.createdTimestamp / 1000);

  return respond.reply(message, 'info', null, {
    thumbnail: g.iconURL({ size: 256 }),
    description: [
      `🏠 **Server info**`,
      `**Name:** ${g.name}`,
      `**ID:** \`${g.id}\``,
      `**Owner:** <@${g.ownerId}>`,
      `**Members:** \`${g.memberCount}\``,
      `**Channels:** \`${g.channels.cache.size}\``,
      `**Roles:** \`${g.roles.cache.size}\``,
      `**Created:** <t:${createdUnix}:F>`
    ].join('\n')
  });
}

module.exports = {
  name: 'serverinfo',
  aliases: ['si', 'guildinfo'],
  category: 'utility',
  description: 'Shows detailed server metadata in a premium server card.',
  usage: 'serverinfo',
  examples: ['serverinfo'],
  guildOnly: true,

  async execute({ message }) {
    if (!message.guild) {
      return respond.reply(message, 'bad', 'This command can only be used in a server.');
    }

    if (!MessageFlags?.IsComponentsV2 || !ContainerBuilder || !TextDisplayBuilder) {
      return sendLegacyServerInfo(message);
    }

    const payload = await buildServerInfoPayload(message).catch(() => null);

    if (!payload) {
      return respond.reply(message, 'bad', 'I could not load this server information.');
    }

    return message.channel.send(payload).catch(() =>
      respond.reply(message, 'bad', 'I could not send the server information panel here.')
    );
  }
};