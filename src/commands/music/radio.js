const respond = require('../../utils/respond');
const musicService = require('../../services/musicService');
const musicUi = require('../../systems/music/musicUiV2');

let recordMusicPlay = async () => null;
try {
  ({ recordMusicPlay } = require('../../systems/music/musicExtras'));
} catch (_error) {
  recordMusicPlay = async () => null;
}

const STATIONS = {
  lofi: [
    'lofi hip hop beats',
    'chillhop lofi beats',
    'sleepy fish lofi',
    'jinsang lofi',
    'idealism lofi'
  ],
  chill: [
    'chill beats',
    'chill electronic mix',
    'ambient chill music',
    'night drive chill',
    'soft chill mix'
  ],
  phonk: [
    'drift phonk',
    'phonk mix',
    'aggressive phonk',
    'brazilian phonk',
    'dark phonk'
  ],
  anime: [
    'anime lofi',
    'anime opening remix',
    'anime chill beats',
    'japanese lofi',
    'anime study music'
  ],
  gym: [
    'workout music',
    'gym phonk',
    'hardstyle gym',
    'workout trap mix',
    'training motivation music'
  ],
  sad: [
    'sad lofi',
    'sad slowed reverb',
    'melancholy beats',
    'rainy lofi',
    'emotional piano beats'
  ],
  focus: [
    'study beats',
    'deep focus music',
    'ambient study music',
    'lofi study',
    'coding music'
  ],
  afro: [
    'afrobeats mix',
    'afro house mix',
    'amapiano mix',
    'afro chill',
    'afrobeats party'
  ],
  piano: [
    'soft piano sleep',
    'peaceful piano',
    'relaxing piano music',
    'calm piano instrumental'
  ]
};

function stationList() {
  return Object.keys(STATIONS)
    .map((name) => `\`${name}\``)
    .join(', ');
}

function stationLines() {
  return Object.entries(STATIONS)
    .map(([name, seeds]) => `**${name}** — ${seeds.slice(0, 2).join(', ')}`)
    .join('\n');
}

function buildOptions(message, extra = {}) {
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
    buildOptions(message, options)
  );
}

async function tryPlaySeeds(message, seeds) {
  let last = null;

  for (const query of seeds) {
    const payload = await runMusic(message, 'play', { query }).catch((error) => ({
      ok: false,
      error: error.message
    }));

    last = payload;

    if (payload?.ok) {
      return {
        ok: true,
        query,
        payload
      };
    }
  }

  return {
    ok: false,
    payload: last
  };
}

function sendRadioCard(message, options) {
  return message.channel.send(
    musicUi.musicNotice({
      client: message.client,
      ...options
    })
  );
}

module.exports = {
  name: 'radio',
  aliases: ['station', 'stations'],
  category: 'music',
  description: 'Start continuous radio from a station or custom query.',
  usage: 'radio <station|list|custom|stop>',
  examples: [
    'radio list',
    'radio lofi',
    'radio phonk',
    'radio custom soft piano sleep',
    'radio stop'
  ],
  guildOnly: true,
  typing: true,
  cooldown: 5,

  async execute({ message, args }) {
    const first = String(args.shift() || 'list').toLowerCase();

    if (first === 'list' || first === 'stations') {
      return sendRadioCard(message, {
        label: 'Radio stations',
        title: 'Available stations',
        detail: [
          stationLines(),
          '',
          `Use \`radio <station>\` or \`radio custom <query>\`.`,
          '',
          `Stations: ${stationList()}`
        ].join('\n'),
        emoji: 'play'
      });
    }

    if (first === 'stop' || first === 'off') {
      await runMusic(message, 'autoplay', { enabled: 'off' }).catch(() => null);
      await runMusic(message, 'stop').catch(() => null);

      return sendRadioCard(message, {
        label: 'Radio',
        title: 'Radio stopped',
        detail: 'Autoplay is off and playback has been stopped.',
        emoji: 'stop'
      });
    }

    if (!message.member?.voice?.channel) {
      return respond.reply(message, 'info', 'Join a voice channel first.', {
        mentionUser: false
      });
    }

    let station = first;
    let seeds = STATIONS[station];

    if (first === 'custom' || first === 'search') {
      const query = args.join(' ').trim();

      if (!query) {
        return sendRadioCard(message, {
          label: 'Radio',
          title: 'Custom radio',
          detail: 'Usage: `radio custom <search query>`.',
          emoji: 'play'
        });
      }

      station = 'custom';
      seeds = [
        query,
        `${query} mix`,
        `${query} playlist`,
        `${query} radio`
      ];
    }

    if (!seeds) {
      return respond.reply(
        message,
        'bad',
        `Unknown station. Use \`radio list\`.\nStations: ${stationList()}`,
        { mentionUser: false }
      );
    }

    const started = await tryPlaySeeds(message, seeds);

    if (!started.ok) {
      return respond.reply(
        message,
        'bad',
        started.payload?.error || `I could not start ${station} radio. Try \`radio custom <query>\`.`,
        { mentionUser: false }
      );
    }

    await runMusic(message, 'autoplay', { enabled: 'on' }).catch(() => null);

    await recordMusicPlay(message.guild.id, message.author.id, {
      type: 'radio',
      radio: station,
      query: started.query
    }).catch(() => null);

    return sendRadioCard(message, {
      label: 'Radio streaming',
      title: `${station} radio`,
      detail: [
        `Started continuous radio using **${started.query}**.`,
        '',
        'Autoplay is now on, so Rumi will keep finding related tracks.'
      ].join('\n'),
      status: `Requested by ${message.member?.displayName || message.author.username}`,
      emoji: 'play'
    });
  }
};