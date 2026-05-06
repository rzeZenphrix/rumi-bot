const respond = require('../../../utils/respond');
const spotifyClient = require('../../../services/spotify/client');
const { createPagedMessage } = require('../../../utils/pagedMessages');
const { createLinkComponents, providerLabel, resolveMemberByText } = require('../../../systems/musicAccounts/shared');

function compactNumber(value) {
  return new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(Number(value || 0));
}

function artistsLine(artists = []) {
  return artists.map((artist) => artist.name).join(', ') || 'Unknown artist';
}

function itemUrl(item) {
  return item?.external_urls?.spotify || item?.href || null;
}

function entitySummary(type, item) {
  if (type === 'track') {
    return {
      description: [
        `**Track**`,
        `${artistsLine(item.artists)}`,
        `Album: **${item.album?.name || 'Unknown'}**`,
        `Duration: \`${Math.round((item.duration_ms || 0) / 1000)}s\``,
        item.explicit ? 'Explicit: `yes`' : null,
        itemUrl(item) || null
      ].filter(Boolean).join('\n'),
      thumbnail: item.album?.images?.[0]?.url || null
    };
  }

  if (type === 'artist') {
    return {
      description: [
        `**Artist**`,
        `Followers: \`${compactNumber(item.followers?.total)}\``,
        `Genres: ${(item.genres || []).slice(0, 5).join(', ') || 'Unknown'}`,
        itemUrl(item) || null
      ].filter(Boolean).join('\n'),
      thumbnail: item.images?.[0]?.url || null
    };
  }

  if (type === 'album') {
    return {
      description: [
        `**Album**`,
        artistsLine(item.artists),
        `Tracks: \`${item.total_tracks || 0}\``,
        `Released: \`${item.release_date || 'Unknown'}\``,
        itemUrl(item) || null
      ].filter(Boolean).join('\n'),
      thumbnail: item.images?.[0]?.url || null
    };
  }

  if (type === 'playlist') {
    return {
      description: [
        `**Playlist**`,
        `Owner: **${item.owner?.display_name || item.owner?.id || 'Unknown'}**`,
        `Tracks: \`${item.tracks?.total || 0}\``,
        `Followers: \`${compactNumber(item.followers?.total)}\``,
        itemUrl(item) || null
      ].filter(Boolean).join('\n'),
      thumbnail: item.images?.[0]?.url || null
    };
  }

  return null;
}

async function showLookupResult(message, type, item) {
  const summary = entitySummary(type, item);
  if (!summary) {
    return respond.reply(message, 'bad', 'I could not format that Spotify result.');
  }

  return respond.reply(message, 'info', null, {
    mentionUser: false,
    title: item.name || providerLabel('spotify'),
    description: summary.description,
    thumbnail: summary.thumbnail
  });
}

async function resolveTargetMemberAndRest(message, args = []) {
  if (!args.length) {
    return { member: message.member, rest: [] };
  }

  const candidate = await resolveMemberByText(message, args[0]);
  if (candidate) {
    return { member: candidate, rest: args.slice(1) };
  }

  if (args.length > 1) {
    const shiftedCandidate = await resolveMemberByText(message, args[1]);
    if (shiftedCandidate) {
      return { member: shiftedCandidate, rest: [args[0], ...args.slice(2)] };
    }
  }

  return { member: message.member, rest: args };
}

async function replyLinkPrompt(message, text = 'Link your Spotify account first.') {
  const { session, components } = await createLinkComponents('spotify', message.author.id, {
    source: 'bot',
    metadata: { command: 'spotify', requestedAt: new Date().toISOString() }
  });

  return respond.reply(message, 'info', null, {
    mentionUser: false,
    title: 'Connect Spotify',
    description: `${text}\n\nThis one-time link expires <t:${Math.floor(new Date(session.expires_at).getTime() / 1000)}:R>.`,
    components
  });
}

function pagingPayload(prefix, ownerId, guildId, pages) {
  return createPagedMessage({
    prefix,
    ownerId,
    guildId,
    type: 'info',
    pages
  });
}

async function lookupSpotifyQuery(message, type, query) {
  if (!spotifyClient.isConfigured()) {
    return respond.reply(message, 'bad', 'Spotify search credentials are not configured yet.');
  }

  const text = String(query || '').trim();
  if (!text) {
    return respond.reply(message, 'info', `Use \`spotify ${type} <query>\`.`);
  }

  const direct = spotifyClient.parseSpotifyInput(text);
  if (direct) {
    const entity = await spotifyClient.getEntity(direct.type, direct.id).catch(() => null);
    if (!entity) {
      return respond.reply(message, 'bad', 'I could not resolve that Spotify URL or URI.');
    }
    return showLookupResult(message, direct.type, entity);
  }

  const bucketName = type === 'artist' ? 'artists' : type === 'album' ? 'albums' : type === 'playlist' ? 'playlists' : 'tracks';
  const results = await spotifyClient.search(text, type, 5).catch(() => null);
  const item = results?.[bucketName]?.items?.[0];
  if (!item) {
    return respond.reply(message, 'bad', 'I could not find that on Spotify.');
  }
  return showLookupResult(message, type, item);
}

module.exports = {
  compactNumber,
  artistsLine,
  itemUrl,
  entitySummary,
  showLookupResult,
  resolveTargetMemberAndRest,
  replyLinkPrompt,
  pagingPayload,
  lookupSpotifyQuery
};
