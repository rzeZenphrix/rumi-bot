const respond = require('../../utils/respond');
const musicService = require('../../services/musicService');
const { VIBES, RADIOS, playQuery, recordMusicPlay } = require('../../systems/music/musicExtras');

function plain(message, type, text) {
  return respond.reply(message, type, text, {
    plain: true,
    useWebhook: false,
    allowedMentions: { parse: [] }
  });
}

async function runMusic(message, command, options = {}) {
  const voiceChannel = message.member?.voice?.channel;

  return musicService.runCommand(message.guild.id, command, {
    ...options,
    userId: message.author.id,
    textChannelId: message.channel.id,
    voiceChannelId: voiceChannel?.id
  });
}

module.exports = {
  name: 'vibe',
  aliases: ['mood'],
  category: 'music',
  description: 'Apply a music mood preset.',
  usage: 'vibe <lofi|chill|anime|nightcore|gym|phonk|sad|focus|clean> [play]',
  examples: ['vibe lofi', 'vibe anime play', 'vibe clean'],
  guildOnly: true,
  typing: true,

  async execute({ message, args }) {
    const name = String(args.shift() || '').toLowerCase();

    if (!name || name === 'list') {
      return plain(message, 'info', `Vibes: ${Object.keys(VIBES).map((x) => `\`${x}\``).join(', ')}`);
    }

    const vibe = VIBES[name];

    if (!vibe) {
      return plain(message, 'bad', 'Unknown vibe. Use `vibe list`.');
    }

    const results = [];

    if (vibe.volume !== undefined) {
      const payload = await runMusic(message, 'volume', {
        value: String(vibe.volume)
      });

      results.push(payload?.ok ? `volume ${vibe.volume}%` : 'volume skipped');
    }

    if (vibe.filter) {
      const payload = await runMusic(message, `filter.${vibe.filter}`);
      results.push(payload?.ok ? `filter ${vibe.filter}` : 'filter skipped');
    }

    const shouldPlay = args.map((x) => x.toLowerCase()).includes('play');

    if (shouldPlay && vibe.radio && RADIOS[vibe.radio]) {
      const payload = await playQuery(message, RADIOS[vibe.radio], 'vibe');
      results.push(payload?.ok ? `${vibe.radio} radio` : 'radio skipped');
    }

    await recordMusicPlay(message.guild.id, message.author.id, {
      type: 'vibe',
      vibe: name
    }).catch(() => null);

    return plain(message, 'good', `Vibe set: ${name}. ${results.join(', ')}.`);
  }
};