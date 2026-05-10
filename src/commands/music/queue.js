const {
  ActionRowBuilder,
  ComponentType,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

const respond = require('../../utils/respond');
const musicService = require('../../services/musicService');

function truncate(value, max = 80) {
  const text = String(value || '').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function buildMusicOptions(message, extra = {}) {
  return {
    ...extra,
    userId: message.author.id,
    textChannelId: message.channel.id,
    voiceChannelId: message.member?.voice?.channel?.id
  };
}

async function runMusic(message, command, options = {}) {
  return musicService.runCommand(
    message.guild.id,
    command,
    buildMusicOptions(message, options)
  );
}

function queueLines(queueData) {
  const tracks = queueData?.tracks || [];

  if (!tracks.length) return 'Nothing else queued.';

  return tracks
    .slice(0, 12)
    .map((track) => {
      const title = truncate(track.title, 58);
      const duration = track.duration || 'Unknown';
      return `\`${String(track.index).padStart(2, '0')}\` ${title} \`${duration}\``;
    })
    .join('\n');
}

function footerText(queueData) {
  if (!queueData) return 'Rumi music';

  return [
    `${queueData.total || 0} waiting`,
    `${queueData.volume || 100}%`,
    `Loop ${queueData.loop || 'Off'}`,
    `Filters ${queueData.filters || 'off'}`
  ].join(' | ');
}

function buildQueueEmbed(payload) {
  const queueData = payload.queueData || {};
  const current = queueData.current;

  const nowPlaying = current
    ? current.url
      ? `[${truncate(current.title, 95)}](${current.url})`
      : `**${truncate(current.title, 95)}**`
    : 'Nothing playing.';

  const description = [
    '`queue`',
    nowPlaying,
    current?.author || null,
    '',
    queueLines(queueData)
  ].filter(Boolean).join('\n');

  const embed = new EmbedBuilder()
    .setDescription(description)
    .setFooter({ text: footerText(queueData) });

  if (current?.thumbnail) embed.setThumbnail(current.thumbnail);

  return embed;
}

function option(label, description, value) {
  return new StringSelectMenuOptionBuilder()
    .setLabel(label)
    .setDescription(description)
    .setValue(value);
}

function actionMenu(disabled = false) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rumi_music_queue_action')
      .setPlaceholder('Choose a queue action')
      .setDisabled(disabled)
      .addOptions(
        option('Refresh queue', 'Reload the current queue view', 'refresh'),
        option('Now playing', 'Show the current track', 'nowplaying'),
        option('Pause', 'Pause the current track', 'pause'),
        option('Resume', 'Resume playback', 'resume'),
        option('Skip', 'Skip the current track', 'skip'),
        option('Shuffle', 'Toggle queue shuffle', 'shuffle'),
        option('Loop off', 'Disable loop', 'loop.off'),
        option('Loop track', 'Repeat the current track', 'loop.track'),
        option('Loop queue', 'Repeat the full queue', 'loop.queue'),
        option('Autoplay on', 'Enable autoplay', 'autoplay.on'),
        option('Autoplay off', 'Disable autoplay', 'autoplay.off'),
        option('Volume 50%', 'Set volume to 50', 'volume.50'),
        option('Volume 65%', 'Set volume to 65', 'volume.65'),
        option('Volume 80%', 'Set volume to 80', 'volume.80'),
        option('Clear queue', 'Remove all waiting tracks', 'clear'),
        option('Stop', 'Stop playback and leave voice', 'stop')
      )
  );
}

function trackMenu(queueData, disabled = false) {
  const tracks = queueData?.tracks || [];

  if (!tracks.length) return null;

  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('rumi_music_queue_track')
      .setPlaceholder('Jump to a queued track')
      .setDisabled(disabled)
      .addOptions(
        tracks.slice(0, 25).map((track) =>
          option(
            `${track.index}. ${truncate(track.title, 80)}`,
            `${track.duration || 'Unknown'}${track.author ? ` | ${truncate(track.author, 40)}` : ''}`.slice(0, 100),
            `skipto.${track.index}`
          )
        )
      )
  );
}

function components(queueData, disabled = false) {
  const rows = [actionMenu(disabled)];
  const tracks = trackMenu(queueData, disabled);
  if (tracks) rows.push(tracks);
  return rows;
}

async function refreshMessage(message, sent, note = null) {
  const payload = await runMusic(message, 'queue');

  if (!payload?.ok) {
    return sent.edit({
      content: payload?.error || 'Nothing is playing.',
      embeds: [],
      components: []
    }).catch(() => null);
  }

  const embed = buildQueueEmbed(payload);

  if (note) {
    embed.setFooter({
      text: `${note} | ${footerText(payload.queueData)}`
    });
  }

  return sent.edit({
    content: null,
    embeds: [embed],
    components: components(payload.queueData)
  }).catch(() => null);
}

function parseAction(value) {
  if (value === 'refresh') return { note: 'Refreshed' };
  if (value === 'nowplaying') return { command: 'nowplaying', note: 'Now playing' };
  if (value === 'pause') return { command: 'pause', note: 'Paused' };
  if (value === 'resume') return { command: 'resume', note: 'Resumed' };
  if (value === 'skip') return { command: 'skip', note: 'Skipped' };
  if (value === 'shuffle') return { command: 'shuffle', note: 'Shuffle toggled' };
  if (value === 'clear') return { command: 'clear', note: 'Queue cleared' };
  if (value === 'stop') return { command: 'stop', note: 'Stopped' };

  if (value.startsWith('loop.')) {
    return {
      command: value,
      note: `Loop ${value.split('.')[1]}`
    };
  }

  if (value.startsWith('autoplay.')) {
    return {
      command: 'autoplay',
      options: { enabled: value.split('.')[1] },
      note: `Autoplay ${value.split('.')[1]}`
    };
  }

  if (value.startsWith('volume.')) {
    return {
      command: 'volume',
      options: { value: value.split('.')[1] },
      note: `Volume ${value.split('.')[1]}%`
    };
  }

  if (value.startsWith('skipto.')) {
    return {
      command: 'skipto',
      options: { index: value.split('.')[1] },
      note: `Skipped to ${value.split('.')[1]}`
    };
  }

  return null;
}

module.exports = {
  name: 'queue',
  aliases: ['q', 'musicqueue'],
  category: 'music',
  description: 'Show the music queue with dropdown controls.',
  usage: 'queue',
  examples: ['queue', 'q'],
  guildOnly: true,
  typing: true,
  cooldown: 3,

  async execute({ message }) {
    const payload = await runMusic(message, 'queue');

    if (!payload?.ok) {
      return respond.reply(message, 'bad', payload?.error || 'Nothing is playing.', {
        mentionUser: false
      });
    }

    const sent = await message.channel.send({
      embeds: [buildQueueEmbed(payload)],
      components: components(payload.queueData),
      allowedMentions: { parse: [] }
    });

    const collector = sent.createMessageComponentCollector({
      componentType: ComponentType.StringSelect,
      time: 5 * 60 * 1000,
      filter: (interaction) => interaction.user.id === message.author.id
    });

    collector.on('collect', async (interaction) => {
      const value = interaction.values?.[0];

      await interaction.deferUpdate().catch(() => null);

      const action = parseAction(value);
      if (!action) return;

      if (action.command) {
        const result = await runMusic(message, action.command, action.options || {});

        if (!result?.ok) {
          return refreshMessage(message, sent, result?.error || 'Action failed.');
        }
      }

      return refreshMessage(message, sent, action.note);
    });

    collector.on('end', async () => {
      const latest = await runMusic(message, 'queue').catch(() => null);
      const queueData = latest?.queueData || payload.queueData;

      await sent.edit({
        components: components(queueData, true)
      }).catch(() => null);
    });

    return sent;
  }
};