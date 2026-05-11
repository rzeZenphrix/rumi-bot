const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const musicUi = require('../../../systems/music/musicUiV2');
const { resolveLastFmTarget, replyLinkPrompt, unix } = require('./shared');

function valueOf(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'string') return value.trim() || null;

  if (typeof value === 'object') {
    return (
      value['#text'] ||
      value.name ||
      value.text ||
      value.value ||
      null
    );
  }

  return String(value);
}

function arrayOf(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function pickImage(images) {
  const list = arrayOf(images);

  if (!list.length) return null;

  const preferred =
    list.find((image) => image.size === 'extralarge' && valueOf(image)) ||
    list.find((image) => image.size === 'large' && valueOf(image)) ||
    list.find((image) => image.size === 'medium' && valueOf(image)) ||
    list.find((image) => valueOf(image));

  return valueOf(preferred);
}

function normalizeTracks(payload) {
  if (!payload) return [];

  if (Array.isArray(payload)) return payload;

  if (Array.isArray(payload.tracks)) return payload.tracks;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.recent)) return payload.recent;

  if (payload.recenttracks?.track) return arrayOf(payload.recenttracks.track);
  if (payload.track) return arrayOf(payload.track);

  if (payload.data?.recenttracks?.track) return arrayOf(payload.data.recenttracks.track);
  if (payload.data?.tracks) return arrayOf(payload.data.tracks);
  if (payload.data?.track) return arrayOf(payload.data.track);

  return [];
}

function normalizeTrack(track) {
  if (!track) return null;

  const nowPlaying =
    track.nowPlaying === true ||
    track.nowplaying === true ||
    track['@attr']?.nowplaying === 'true' ||
    track.attr?.nowplaying === 'true';

  const uts =
    track.playedAt ||
    track.date?.uts ||
    track.date?.timestamp ||
    track.timestamp ||
    null;

  const playedAt = uts
    ? unix(Number(uts))
    : null;

  return {
    name: valueOf(track.name || track.title) || 'Unknown track',
    artist: valueOf(track.artist) || valueOf(track.artistName) || 'Unknown artist',
    album: valueOf(track.album) || valueOf(track.albumName) || null,
    url: track.url || track.trackUrl || null,
    image: pickImage(track.image || track.images || track.album?.image),
    nowPlaying,
    playedAt,
    userplaycount: track.userplaycount || track.playcount || null
  };
}

module.exports = {
  id: 'nowplaying',
  aliases: ['np', 'playing'],
  description: 'Show what a Last.fm user is playing right now, or their latest scrobble.',
  usage: 'lastfm nowplaying [@user|username]',
  examples: ['lastfm nowplaying', 'lastfm np @Rumi'],

  async run({ message, args }) {
    const { username } = await resolveLastFmTarget(
      message,
      args,
      lastfmAccount.getLinkedUsername
    );

    if (!username) {
      return replyLinkPrompt(message, 'Link your Last.fm account first.');
    }

    let payload;

    try {
      payload = await lastfmAccount.getRecent(username, 1);
    } catch (error) {
      return respond.reply(
        message,
        'bad',
        `Last.fm request failed: ${error.message || 'unknown error'}`,
        { mentionUser: false }
      );
    }

    const tracks = normalizeTracks(payload);
    const track = normalizeTrack(tracks[0]);

    if (!track) {
      return respond.reply(
        message,
        'bad',
        `No recent Last.fm tracks were found for \`${username}\`. Check that the username is correct and has public scrobbles.`,
        { mentionUser: false }
      );
    }

    return message.channel.send(
      musicUi.lastfmNowPlaying({
        username,
        client: message.client,
        track
      })
    );
  }
};