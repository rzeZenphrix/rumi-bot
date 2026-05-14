const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContainerBuilder,
  MediaGalleryBuilder,
  MessageFlags,
  PermissionFlagsBits,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder
} = require('discord.js');

const respond = require('../../utils/respond');
const { getSnipe } = require('../../systems/snipe/snipeStore');

const VIEW_TIME_MS = 120000;

function truncate(text, max = 1200) {
  const value = String(text || '').trim();

  if (!value) return '*no text content*';
  if (value.length <= max) return value;

  return `${value.slice(0, max - 1)}…`;
}

function cleanLine(text, max = 180) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max) || 'unknown';
}

function allMedia(snipe) {
  return [
    ...(Array.isArray(snipe.attachments) ? snipe.attachments : []),
    ...(Array.isArray(snipe.stickers) ? snipe.stickers : [])
  ];
}

function parseType(args, commandName = '') {
  let type = ['editsnipe', 'esnipe', 'esn'].includes(String(commandName).toLowerCase())
    ? 'edit'
    : 'delete';

  const first = String(args[0] || '').toLowerCase();

  if (['edit', 'edits'].includes(first)) {
    args.shift();
    type = 'edit';
  }

  if (['delete', 'deleted', 'del'].includes(first)) {
    args.shift();
    type = 'delete';
  }

  return type;
}

function timestamp(ms) {
  const time = Math.floor(Number(ms || Date.now()) / 1000);
  return `<t:${time}:R>`;
}

function actionLabel(type) {
  return type === 'edit' ? 'Edited message' : 'Deleted message';
}

function actorLine(snipe, type) {
  if (type === 'edit') {
    return snipe.actionByMention || snipe.authorMention || 'unknown';
  }

  if (snipe.actionByMention) {
    return `${snipe.actionByMention} via audit log`;
  }

  return 'unknown';
}

function authorLine(snipe) {
  const mention = snipe.authorMention || 'unknown user';
  const tag = snipe.authorTag || snipe.authorId || 'unknown';

  return `${mention} · \`${cleanLine(tag, 80)}\``;
}

function mediaLinks(media) {
  const links = media
    .filter((item) => item?.url)
    .slice(0, 8)
    .map((item, index) => {
      const name = cleanLine(item.name || `media-${index + 1}`, 70);
      return `${index + 1}. [${name}](${item.url})`;
    });

  return links.length ? links.join('\n') : 'No media recovered.';
}

function renderableMedia(media) {
  return media
    .filter((item) => item?.url && item.renderable)
    .slice(0, 10);
}

function navId(message, type, index, action) {
  return [
    'rumi',
    'snipe',
    message.id,
    message.author.id,
    type,
    index,
    action
  ].join(':').slice(0, 100);
}

function parseNavId(customId) {
  const parts = String(customId || '').split(':');

  if (parts[0] !== 'rumi' || parts[1] !== 'snipe') return null;

  return {
    messageId: parts[2],
    userId: parts[3],
    type: parts[4],
    index: Number(parts[5] || 1),
    action: parts[6]
  };
}

function buildButtons(message, type, index) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(navId(message, type, index, 'prev'))
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(index <= 1),

    new ButtonBuilder()
      .setCustomId(navId(message, type, index, 'next'))
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(navId(message, type, index, 'switch'))
      .setLabel(type === 'edit' ? 'Deleted' : 'Edited')
      .setStyle(ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId(navId(message, type, index, 'close'))
      .setLabel('Close')
      .setStyle(ButtonStyle.Secondary)
  );
}

function buildHeaderText(snipe, type, index) {
  const channel = snipe.channelId ? `<#${snipe.channelId}>` : 'unknown channel';

  return [
    `### ${actionLabel(type)} #${index}`,
    `Author: ${authorLine(snipe)}`,
    `${type === 'edit' ? 'Edited by' : 'Deleted by'}: ${actorLine(snipe, type)}`,
    `Channel: ${channel}`,
    `Stored: ${timestamp(snipe.storedAt)}`
  ].join('\n');
}

function buildBodyText(snipe, type) {
  if (type === 'edit') {
    return [
      '**Before**',
      truncate(snipe.oldContent, 900),
      '',
      '**After**',
      truncate(snipe.newContent, 900)
    ].join('\n');
  }

  return [
    '**Message**',
    truncate(snipe.content, 1400)
  ].join('\n');
}

function buildMediaGallery(media) {
  const renderables = renderableMedia(media);

  if (!renderables.length) return null;

  return new MediaGalleryBuilder().addItems(
    ...renderables.map((item, index) => {
      return (mediaItem) => mediaItem
        .setURL(item.url)
        .setDescription(cleanLine(item.name || `media-${index + 1}`, 100));
    })
  );
}

function buildCv2Payload(message, snipe, type, index, closed = false) {
  const media = allMedia(snipe);
  const gallery = buildMediaGallery(media);

  const container = new ContainerBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buildHeaderText(snipe, type, index))
    )
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(buildBodyText(snipe, type))
    );

  if (gallery) {
    container
      .addSeparatorComponents(
        new SeparatorBuilder()
          .setDivider(true)
          .setSpacing(SeparatorSpacingSize.Small)
      )
      .addMediaGalleryComponents(gallery);
  }

  container
    .addSeparatorComponents(
      new SeparatorBuilder()
        .setDivider(true)
        .setSpacing(SeparatorSpacingSize.Small)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**Media**\n${mediaLinks(media)}`)
    );

  if (!closed) {
    container.addActionRowComponents(buildButtons(message, type, index));
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  };
}

async function sendNoSnipe(message, type, index) {
  return respond.reply(
    message,
    'bad',
    type === 'edit'
      ? `I do not have edited message #${index} saved in this channel.`
      : `I do not have deleted message #${index} saved in this channel.`,
    { mentionUser: false, allowedMentions: { parse: [] } }
  );
}

module.exports = {
  name: 'snipe',
  aliases: ['s'],
  category: 'misc',
  description: 'Show recently deleted or edited messages.',
  usage: 'snipe [delete|edit] [index]',
  examples: [
    'snipe',
    'snipe 2',
    'snipe edit',
    'snipe edits 3'
  ],
  slash: true,
  botPermissions: [
    PermissionFlagsBits.EmbedLinks
  ],
  subcommands: [
    {
      name: 'delete',
      aliases: ['deleted', 'del'],
      usage: 'snipe delete [index]',
      description: 'Show a recently deleted message.',
      examples: ['snipe delete', 'snipe delete 2']
    },
    {
      name: 'edit',
      aliases: ['edits'],
      usage: 'snipe edit [index]',
      description: 'Show a recently edited message.',
      examples: ['snipe edit', 'snipe edit 2']
    }
  ],

  async execute({ message, args, commandName }) {
    let type = parseType(args, commandName);
    let index = Math.max(1, Number.parseInt(String(args[0] || '1'), 10) || 1);

    let snipe = getSnipe(message.channel, type, index);

    if (!snipe) {
      return sendNoSnipe(message, type, index);
    }

    const sent = await message.channel.send(
      buildCv2Payload(message, snipe, type, index)
    );

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: VIEW_TIME_MS
    });

    collector.on('collect', async (interaction) => {
      const parsed = parseNavId(interaction.customId);

      if (!parsed || parsed.messageId !== message.id) {
        return interaction.deferUpdate().catch(() => null);
      }

      if (interaction.user.id !== message.author.id) {
        return interaction.reply({
          content: 'This snipe menu is not for you.',
          ephemeral: true
        }).catch(() => null);
      }

      if (parsed.action === 'close') {
        collector.stop('closed');

        return interaction.update(
          buildCv2Payload(message, snipe, type, index, true)
        ).catch(() => null);
      }

      let nextType = type;
      let nextIndex = index;

      if (parsed.action === 'prev') {
        nextIndex = Math.max(1, index - 1);
      }

      if (parsed.action === 'next') {
        nextIndex = index + 1;
      }

      if (parsed.action === 'switch') {
        nextType = type === 'edit' ? 'delete' : 'edit';
        nextIndex = 1;
      }

      const nextSnipe = getSnipe(message.channel, nextType, nextIndex);

      if (!nextSnipe) {
        return interaction.reply({
          content: `No ${nextType === 'edit' ? 'edited' : 'deleted'} message #${nextIndex} saved in this channel.`,
          ephemeral: true
        }).catch(() => null);
      }

      type = nextType;
      index = nextIndex;
      snipe = nextSnipe;

      return interaction.update(
        buildCv2Payload(message, snipe, type, index)
      ).catch(() => null);
    });

    collector.on('end', async (_collected, reason) => {
      if (reason === 'closed') return;

      await sent.edit(
        buildCv2Payload(message, snipe, type, index, true)
      ).catch(() => null);
    });

    return sent;
  }
};
