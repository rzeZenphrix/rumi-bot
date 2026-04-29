const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const respond = require('../../utils/respond');
const musicService = require('../../services/musicService');
const spotifyClient = require('../../services/spotify/client');
const { isMusicReady, MUSIC_NOT_READY } = require('../../systems/runtime/featureGates');

function compactNumber(value) {
  return new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(Number(value || 0));
}

function artistsLine(artists = []) {
  return artists.map((artist) => artist.name).join(', ') || 'Unknown artist';
}

function itemUrl(item) {
  return item?.external_urls?.spotify || item?.href || null;
}

function formatTrack(track) {
  return {
    description: `**Track**\n${artistsLine(track.artists)}\nAlbum: **${track.album?.name || 'Unknown'}**\nDuration: \`${Math.round((track.duration_ms || 0) / 1000)}s\`${track.explicit ? '\nExplicit: `yes`' : ''}\n${itemUrl(track) || ''}`.trim(),
    thumbnail: track.album?.images?.[0]?.url || null
  };
}

function formatArtist(artist) {
  return {
    description: `**Artist**\nFollowers: \`${compactNumber(artist.followers?.total)}\`\nGenres: ${(artist.genres || []).slice(0, 4).join(', ') || 'Unknown'}\n${itemUrl(artist) || ''}`.trim(),
    thumbnail: artist.images?.[0]?.url || null
  };
}

function formatAlbum(album) {
  return {
    description: `**Album**\n${artistsLine(album.artists)}\nTracks: \`${album.total_tracks || 0}\`\nReleased: \`${album.release_date || 'Unknown'}\`\n${itemUrl(album) || ''}`.trim(),
    thumbnail: album.images?.[0]?.url || null
  };
}

function formatPlaylist(playlist) {
  return {
    description: `**Playlist**\nOwner: **${playlist.owner?.display_name || playlist.owner?.id || 'Unknown'}**\nTracks: \`${playlist.tracks?.total || 0}\`\nFollowers: \`${compactNumber(playlist.followers?.total)}\`\n${itemUrl(playlist) || ''}`.trim(),
    thumbnail: playlist.images?.[0]?.url || null
  };
}

function formatEntity(type, item) {
  if (type === 'track') return formatTrack(item);
  if (type === 'artist') return formatArtist(item);
  if (type === 'album') return formatAlbum(item);
  if (type === 'playlist') return formatPlaylist(item);
  return null;
}

function failureText(payload, fallback) {
  if (!payload) {
    return fallback;
  }

  if (payload.detail) {
    return `${payload.error || fallback}\n${payload.detail}`;
  }

  return payload.error || fallback;
}

function parsePrefixSpotify(args) {
  const sub = String(args.shift() || '').toLowerCase();
  const direct = new Set(['link', 'unlink', 'status', 'nowplaying', 'play', 'pause', 'resume', 'skip', 'previous', 'liked', 'recommendations', 'volume', 'shuffle', 'repeat', 'sync', 'autosync', 'follow', 'priority', 'resolve', 'cache', 'debug']);
  if (direct.has(sub)) {
    return { command: sub, options: { query: args.join(' '), value: args[0] || '', enabled: args[0] || '', mode: args[0] || '' } };
  }
  if (sub === 'queue') {
    const mode = String(args.shift() || '').toLowerCase();
    return { command: `queue.${mode || 'add'}`, options: { query: args.join(' ') } };
  }
  if (sub === 'playlist') {
    const mode = String(args.shift() || '').toLowerCase();
    return { command: `playlist.${mode || 'list'}`, options: { query: args.join(' ') } };
  }
  if (sub === 'device') {
    const mode = String(args.shift() || '').toLowerCase();
    return { command: `device.${mode || 'list'}`, options: { device: args.join(' '), query: args.join(' ') } };
  }
  if (['track', 'artist', 'album', 'playlist'].includes(sub)) {
    return { searchType: sub, query: args.join(' ') };
  }
  return { searchType: null, query: [sub, ...args].filter(Boolean).join(' ') };
}

function buildMusicOptions(message, parsed) {
  const options = {
    ...parsed.options,
    userId: message.author.id,
    textChannelId: message.channel.id
  };

  const voiceChannel = message.member?.voice?.channel;
  if (voiceChannel) {
    options.voiceChannelId = voiceChannel.id;
  }

  return options;
}

async function showResolvedEntity(message, type, entity) {
  const formatted = formatEntity(type, entity);
  if (!formatted) {
    return respond.reply(message, 'bad', 'I could not format that Spotify item.');
  }

  return respond.reply(message, 'info', null, {
    mentionUser: false,
    title: entity.name || 'Spotify',
    description: formatted.description,
    thumbnail: formatted.thumbnail
  });
}

async function handleSpotifyLookup(message, parsed) {
  if (!spotifyClient.isConfigured()) {
    return respond.reply(message, 'bad', 'Spotify API credentials are not configured yet.');
  }

  const query = String(parsed.query || parsed.options?.query || '').trim();
  if (!query) {
    return respond.reply(message, 'info', 'Use `spotify <query>`, `spotify track <name>`, or `spotify resolve <spotify-url-or-uri>`.');
  }

  const direct = spotifyClient.parseSpotifyInput(query);
  if (direct) {
    const entity = await spotifyClient.getEntity(direct.type, direct.id).catch(() => null);
    if (!entity) return respond.reply(message, 'bad', 'I could not resolve that Spotify item.');
    return showResolvedEntity(message, direct.type, entity);
  }

  const type = parsed.searchType || 'track';
  const results = await spotifyClient.search(query, type, 5).catch(() => null);
  const bucket = `${type}s`;
  const item = results?.[bucket]?.items?.[0];
  if (!item) {
    return respond.reply(message, 'bad', 'I could not find that item on Spotify.');
  }

  return showResolvedEntity(message, type, item);
}

module.exports = {
  name: 'spotify',
  aliases: ['spoti'],
  category: 'utility',
  description: 'Use Spotify search or proxy live Spotify/music service controls.',
  usage: 'spotify [link|unlink|status|play|queue|playlist|device|resolve|track|artist|album|playlist] ...',
  examples: ['spotify pink pony club', 'spotify play pink pony club', 'spotify queue add saturn', 'spotify resolve spotify:track:...', 'spotify device set desktop'],

  async execute({ message, args }) {
    const parsed = parsePrefixSpotify([...args]);

    if (!parsed.command && !parsed.query) {
      return respond.reply(message, 'info', 'Use `spotify <query>`, `spotify play <query>`, `spotify resolve <query>`, or `spotify device set <name>`.');
    }

    if (!parsed.command || parsed.searchType || parsed.command === 'resolve') {
      return handleSpotifyLookup(message, parsed);
    }

    if (!message.guild) {
      return respond.reply(message, 'bad', 'Spotify playback commands need to be used inside a server.');
    }

    if (!isMusicReady()) {
      return respond.reply(message, 'info', MUSIC_NOT_READY);
    }

    if (parsed.command === 'link') {
      const payload = await musicService.linkSpotify(message.author.id);
      if (!payload?.ok) {
        return respond.reply(message, 'bad', failureText(payload, 'I could not reach the Spotify link service right now.'));
      }

      const components = payload.authorizeUrl
        ? [
            new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setLabel('Open Spotify link')
                .setStyle(ButtonStyle.Link)
                .setURL(payload.authorizeUrl)
            )
          ]
        : [];

      return respond.reply(message, 'info', null, {
        title: 'Spotify link',
        description: payload.message || 'Open the link below to finish connecting your Spotify account.',
        components
      });
    }

    if (parsed.command === 'unlink') {
      const payload = await musicService.unlinkSpotify(message.author.id);
      if (!payload?.ok) {
        return respond.reply(message, 'bad', failureText(payload, 'I could not reach the Spotify link service right now.'));
      }
      return respond.reply(message, 'good', payload.ok ? 'Removed your Spotify link state.' : 'There was no Spotify link to remove.');
    }

    const payload = await musicService.runCommand(message.guild.id, parsed.command, buildMusicOptions(message, parsed));
    if (!payload?.ok) {
      return respond.reply(message, 'bad', failureText(payload, 'I could not reach the music service right now.'));
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: payload.title || 'Spotify',
      description: payload.description || 'The Spotify service returned an empty response.',
      fields: Array.isArray(payload.fields) ? payload.fields : [],
      thumbnail: payload.thumbnail || null,
      footer: payload.footer ? { text: payload.footer } : undefined,
      color: Number.isFinite(Number(payload.color)) ? Number(payload.color) : undefined
    });
  }
};
