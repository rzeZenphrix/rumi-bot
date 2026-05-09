const { AttachmentBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const emojis = require('../../utils/botEmojis');
const respond = require('../../utils/respond');
const { getSnipe } = require('../../systems/snipe/snipeStore');

const RUMI_COLORS = {
  info: respond.DEFAULT_EMBED_COLOR,
  alert: respond.ERROR_EMBED_COLOR,
  good: respond.DEFAULT_EMBED_COLOR,
  bad: respond.ERROR_EMBED_COLOR
};

function truncate(text, max = 950) {
  const value = String(text || '').trim();

  if (!value) return '*no text content*';
  if (value.length <= max) return value;

  return `${value.slice(0, max - 3)}...`;
}

function allMedia(snipe) {
  return [
    ...(snipe.attachments || []),
    ...(snipe.stickers || [])
  ];
}

function safeEmoji(name, fallback) {
  return emojis?.[name] || fallback;
}

function formatActionActor(snipe, type) {
  if (type === 'edit') {
    return snipe.actionByMention || snipe.authorMention || '**unknown user**';
  }

  if (snipe.actionByMention) {
    return `${snipe.actionByMention} via audit log`;
  }

  return 'Self-delete or unknown. Give me **View Audit Log** to identify moderator deletions.';
}

function authorLine(snipe) {
  return `${snipe.authorMention || '`unknown user`'}\n\`${snipe.authorTag || snipe.authorId || 'unknown'}\``;
}

function mediaSummary(media) {
  if (!media.length) return 'No media recovered.';

  return media
    .slice(0, 6)
    .map((item, index) => {
      const name = item.name || `media-${index + 1}`;
      return `${index + 1}. ${item.url ? `[${name}](${item.url})` : `\`${name}\``}`;
    })
    .join('\n');
}

function buildSnipeEmbeds(message, snipe, type, index) {
  const media = allMedia(snipe);
  const color = type === 'edit' ? RUMI_COLORS.info : RUMI_COLORS.alert;
  const actionVerb = type === 'edit' ? 'Edited message' : 'Deleted message';
  const storedAt = Math.floor((snipe.storedAt || Date.now()) / 1000);

  const main = new EmbedBuilder()
    .setColor(color)
    .setAuthor({
      name: `Rumi Snipe • ${actionVerb}`,
      iconURL: snipe.authorAvatar || undefined
    })
    .setTitle(`#${index} recovered ${type === 'edit' ? 'edit' : 'delete'} event`)
    .setDescription(
      type === 'edit'
        ? [
            `${safeEmoji('list', '•')} **Before**`,
            truncate(snipe.oldContent, 900),
            '',
            `${safeEmoji('good', '•')} **After**`,
            truncate(snipe.newContent, 900)
          ].join('\n')
        : [
            `${safeEmoji('list', '•')} **Deleted content**`,
            truncate(snipe.content, 1300)
          ].join('\n')
    )
    .addFields(
      {
        name: 'Message author',
        value: authorLine(snipe),
        inline: true
      },
      {
        name: type === 'edit' ? 'Edited by' : 'Deleted by',
        value: formatActionActor(snipe, type),
        inline: true
      },
      {
        name: 'Channel',
        value: snipe.channelId ? `<#${snipe.channelId}>` : 'Unknown channel',
        inline: true
      },
      {
        name: 'Stored',
        value: `<t:${storedAt}:R>\n<t:${storedAt}:f>`,
        inline: true
      },
      {
        name: 'Recovered media',
        value: mediaSummary(media),
        inline: false
      }
    )
    .setFooter({
      text: type === 'edit'
        ? 'Edit snipes show before/after content when available.'
        : 'Delete snipes may not identify moderator deletions without audit log access.'
    })
    .setTimestamp(new Date(snipe.storedAt || Date.now()));

  const firstRenderable = media.find((item) => item.renderable && item.url);

  if (firstRenderable?.url) {
    main.setImage(firstRenderable.url);
  }

  const embeds = [respond.styleEmbed(main, type === 'edit' ? 'info' : 'bad', message.author, { message })];

  for (const item of media.filter((m) => m.url && m.url !== firstRenderable?.url).slice(0, 7)) {
    const mediaEmbed = new EmbedBuilder()
      .setColor(color)
      .setDescription(`${safeEmoji('list', '•')} Recovered media: **${item.name || 'media'}**`);

    if (item.renderable) {
      mediaEmbed.setImage(item.url);
    } else {
      mediaEmbed.addFields({
        name: 'File',
        value: `[Open media](${item.url})`,
        inline: false
      });
    }

    embeds.push(respond.styleEmbed(mediaEmbed, type === 'edit' ? 'info' : 'bad', message.author, { message }));
  }

  return embeds.slice(0, 10);
}

function buildAttachmentFiles(snipe) {
  const media = allMedia(snipe);

  return media
    .filter((item) => item.url)
    .slice(0, 5)
    .map((item) => new AttachmentBuilder(item.url, {
      name: item.name || `snipe-${item.id || Date.now()}`
    }));
}

function parseType(args, commandName) {
  let type = ['editsnipe', 'esnipe', 'esn'].includes(commandName) ? 'edit' : 'delete';

  const first = String(args[0] || '').toLowerCase();

  if (first === 'edit' || first === 'edits') {
    args.shift();
    type = 'edit';
  }

  if (first === 'delete' || first === 'deleted' || first === 'del') {
    args.shift();
    type = 'delete';
  }

  return type;
}

module.exports = {
  name: 'snipe',
  aliases: ['sn', 'editsnipe', 'esnipe', 'esn'],
  category: 'misc',
  description: 'Show recently deleted or edited messages with recovered content and media.',
  usage: 'snipe [delete|edit] [index]',
  examples: [
    'snipe',
    'snipe 2',
    'snipe edit',
    'editsnipe 3'
  ],
  slash: true,
  botPermissions: [
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles
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
    const type = parseType(args, commandName);
    const index = Math.max(1, Number(args[0] || 1) || 1);
    const snipe = getSnipe(message.channel, type, index);

    if (!snipe) {
      return respond.reply(
        message,
        'bad',
        type === 'edit'
          ? `I do not have edited message #${index} saved in this channel.`
          : `I do not have deleted message #${index} saved in this channel.`,
        { mentionUser: false }
      );
    }

    const embeds = buildSnipeEmbeds(message, snipe, type, index);
    const files = buildAttachmentFiles(snipe);

    try {
      return await message.channel.send({ embeds, files });
    } catch {
      return message.channel.send({ embeds });
    }
  }
};
