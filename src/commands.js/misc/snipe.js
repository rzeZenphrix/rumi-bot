const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const emojis = require('../../utils/botEmojis');
const { COLORS } = require('../../utils/respond');
const respond = require('../../utils/respond');
const { getSnipe } = require('../../systems/snipe/snipeStore');

function truncate(text, max = 900) {
  if (!text) return '*no text*';
  if (text.length <= max) return text;

  return `${text.slice(0, max - 3)}...`;
}

function allMedia(snipe) {
  return [
    ...(snipe.attachments || []),
    ...(snipe.stickers || [])
  ];
}

function formatActionActor(snipe, type) {
  if (type === 'edit') {
    return snipe.actionByMention || snipe.authorMention || '**unknown user**';
  }

  if (snipe.actionByMention) return `${snipe.actionByMention} via audit log`;

  return 'self-delete or unknown — give me **View Audit Log** to identify moderator deletions';
}

function buildSnipeEmbeds(snipe, type, index) {
  const media = allMedia(snipe);
  const color = type === 'edit' ? COLORS.info : COLORS.alert;
  const actionVerb = type === 'edit' ? 'edited' : 'deleted';

  const main = new EmbedBuilder()
    .setColor(color)
    .setTitle(`Rumi snipe #${index} • ${actionVerb} message`)
    .addFields(
      {
        name: 'Message author',
        value: `${snipe.authorMention} (${snipe.authorTag || snipe.authorId || 'unknown'})`,
        inline: false
      },
      {
        name: type === 'edit' ? 'Edited by' : 'Deleted by',
        value: formatActionActor(snipe, type),
        inline: false
      },
      {
        name: 'Channel',
        value: `<#${snipe.channelId}>`,
        inline: true
      },
      {
        name: 'Stored',
        value: `<t:${Math.floor((snipe.storedAt || Date.now()) / 1000)}:R>`,
        inline: true
      }
    );

  if (type === 'edit') {
    main.setDescription(
      `**Before**\n${truncate(snipe.oldContent)}\n\n` +
      `**After**\n${truncate(snipe.newContent)}`
    );
  } else {
    main.setDescription(
      `**Deleted content**\n${truncate(snipe.content)}`
    );
  }

  const embeds = [main];

  for (const item of media.slice(0, 8)) {
    if (!item.url) continue;

    const mediaEmbed = new EmbedBuilder()
      .setColor(color)
      .setDescription(`${emojis.list} Recovered media from ${snipe.authorMention}: \`${item.name || 'media'}\`.`);

    if (item.renderable) {
      mediaEmbed.setImage(item.url);
    }

    embeds.push(mediaEmbed);
  }

  return embeds.slice(0, 10);
}

function buildAttachmentFiles(snipe) {
  const media = allMedia(snipe);

  return media
    .filter((item) => item.url)
    .slice(0, 5)
    .map((item) => {
      return new AttachmentBuilder(item.url, {
        name: item.name || `snipe-${item.id || Date.now()}`
      });
    });
}

module.exports = {
  name: 'snipe',
  aliases: ['sn', 'editsnipe', 'esnipe', 'esn'],
  category: 'misc',
  description: 'Show recently deleted or edited messages, including who did what and recovered media.',
  usage: 'snipe [delete|edit] [index]',
  examples: ['snipe', 'snipe 2', 'snipe edit', 'editsnipe 3'],
  subcommands: [
    {
      name: 'delete',
      usage: 'snipe delete [index]',
      description: 'Show a deleted message.'
    },
    {
      name: 'edit',
      usage: 'snipe edit [index]',
      description: 'Show an edited message.'
    }
  ],

  async execute({ message, args, commandName }) {
    let type = 'delete';

    if (commandName === 'editsnipe' || commandName === 'esnipe' || commandName === 'esn') {
      type = 'edit';
    }

    if (args[0] === 'edit' || args[0] === 'edits') {
      type = 'edit';
      args.shift();
    }

    if (args[0] === 'delete' || args[0] === 'deleted') {
      type = 'delete';
      args.shift();
    }

    const index = Number(args[0] || 1);
    const snipe = getSnipe(message.channel, type, index);

    if (!snipe) {
      return respond.reply(
        message,
        'bad',
        type === 'edit'
          ? 'I do not have an edited message saved here.'
          : 'I do not have a deleted message saved here.'
      );
    }

    const embeds = buildSnipeEmbeds(snipe, type, Math.max(1, index || 1));
    const files = buildAttachmentFiles(snipe);

    try {
      return await message.channel.send({
        embeds,
        files
      });
    } catch {
      return message.channel.send({
        embeds
      });
    }
  }
};