const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const { resolveMemberByText } = require('../../../systems/musicAccounts/shared');
const { replyLinkPrompt } = require('./shared');

function overlap(left = [], right = []) {
  const rightSet = new Set(right.map((item) => String(item.name || '').toLowerCase()));
  return left.filter((item) => rightSet.has(String(item.name || '').toLowerCase()));
}

module.exports = {
  id: 'compare',
  description: 'Compare the Last.fm taste overlap between two Discord users.',
  usage: 'lastfm compare @user [period]',
  examples: ['lastfm compare @Rumi', 'lastfm compare @Rumi 1month'],
  async run({ message, args }) {
    const target = await resolveMemberByText(message, args[0] || '');
    if (!target) return respond.reply(message, 'info', 'Use `lastfm compare @user [period]`.');

    const period = args[1] || '7day';
    const mine = await lastfmAccount.getLinkedUsername(message.author.id);
    if (!mine) return replyLinkPrompt(message, 'Link your Last.fm account first.');

    const theirs = await lastfmAccount.getLinkedUsername(target.id);
    if (!theirs) return respond.reply(message, 'bad', 'That user has not linked Last.fm yet.');

    const [myArtists, theirArtists, myTracks, theirTracks] = await Promise.all([
      lastfmAccount.getTop(mine, period, 'artists', 20).catch(() => []),
      lastfmAccount.getTop(theirs, period, 'artists', 20).catch(() => []),
      lastfmAccount.getTop(mine, period, 'tracks', 20).catch(() => []),
      lastfmAccount.getTop(theirs, period, 'tracks', 20).catch(() => []),
    ]);

    const sharedArtists = overlap(myArtists, theirArtists);
    const sharedTracks = overlap(myTracks, theirTracks);

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Last.fm | Compare',
      description: `Comparing **${mine}** with **${theirs}**.`,
      fields: [
        {
  id: 'Shared artists',
          value: sharedArtists.length ? sharedArtists.slice(0, 8).map((item) => `• ${item.name}`).join('\n') : 'No shared top artists in this window.',
          inline: false
        },
        {
  id: 'Shared tracks',
          value: sharedTracks.length ? sharedTracks.slice(0, 8).map((item) => `• ${item.name}`).join('\n') : 'No shared top tracks in this window.',
          inline: false
        }
      ],
      footer: { text: `Window: ${lastfmAccount.periodLabel(period)}` }
    });
  }
};
