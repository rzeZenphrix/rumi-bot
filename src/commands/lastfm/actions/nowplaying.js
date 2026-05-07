const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const { resolveLastFmTarget, replyLinkPrompt, unix } = require('./shared');

module.exports = {
  id: 'nowplaying',
  aliases: ['np', 'playing'],
  description: 'Show what a Last.fm user is playing right now, or their latest scrobble.',
  usage: 'lastfm nowplaying [@user|username]',
  examples: ['lastfm nowplaying', 'lastfm np @Rumi'],
  async run({ message, args }) {
    const { username } = await resolveLastFmTarget(message, args, lastfmAccount.getLinkedUsername);
    if (!username) return replyLinkPrompt(message, 'Link your Last.fm account first.');

    const tracks = await lastfmAccount.getRecent(username, 1).catch(() => null);
    const track = tracks?.[0];
    if (!track) return respond.reply(message, 'bad', 'No recent Last.fm tracks were found.');

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: [
        track.nowPlaying ? `-# Now playing for ${username}` : `-# Last Played for ${username}`,
        `[**${track.name}**](${track.url})`,
        `by **${track.artist}**`,
        track.album ? `Album: **${track.album}**` : null,
        track.nowPlaying ? '-# currently scrobbling' : `Played ${unix(track.playedAt)}`,
      ].filter(Boolean).join('\n'),
      thumbnail: track.image || null,
    });
  }
};
