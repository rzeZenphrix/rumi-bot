const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { resolveMemberByText } = require('../../../systems/musicAccounts/shared');
const { replyLinkPrompt } = require('./shared');

function overlap(left = [], right = []) {
  const rightMap = new Map(right.map((item) => [String(item.name || '').toLowerCase(), item]));
  return left.filter((item) => rightMap.has(String(item.name || '').toLowerCase()));
}

module.exports = {
  id: 'compare',
  description: 'Compare the linked Spotify tastes of two Discord users.',
  usage: 'spotify compare @user [short|medium|long]',
  examples: ['spotify compare @Rumi', 'spotify compare @Rumi short'],
  async run({ message, args }) {
    const target = await resolveMemberByText(message, args[0] || '');
    if (!target) {
      return respond.reply(message, 'info', 'Use `spotify compare @user [short|medium|long]`.');
    }

    const range = args[1] || 'medium';
    const mine = await spotifyAccount.getFreshAccount(message.author.id).catch(() => null);
    if (!mine) return replyLinkPrompt(message, 'Link your Spotify account first.');

    const theirs = await spotifyAccount.getFreshAccount(target.id).catch(() => null);
    if (!theirs) return respond.reply(message, 'bad', 'That user has not linked Spotify yet.');

    const [myArtists, theirArtists, myTracks, theirTracks] = await Promise.all([
      spotifyAccount.getTopArtists(message.author.id, range, 20).catch(() => null),
      spotifyAccount.getTopArtists(target.id, range, 20).catch(() => null),
      spotifyAccount.getTopTracks(message.author.id, range, 20).catch(() => null),
      spotifyAccount.getTopTracks(target.id, range, 20).catch(() => null)
    ]);

    const sharedArtists = overlap(myArtists?.items || [], theirArtists?.items || []);
    const sharedTracks = overlap(myTracks?.items || [], theirTracks?.items || []);

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Spotify | Taste Compare',
      description: `Comparing **${mine.display_name || message.member.displayName}** with **${theirs.display_name || target.displayName}**.`,
      fields: [
        {
  id: 'Shared artists',
          value: sharedArtists.length
            ? sharedArtists.slice(0, 8).map((artist) => `• ${artist.name}`).join('\n')
            : 'No shared top artists in this window.',
          inline: false
        },
        {
  id: 'Shared tracks',
          value: sharedTracks.length
            ? sharedTracks.slice(0, 8).map((track) => `• ${track.name}`).join('\n')
            : 'No shared top tracks in this window.',
          inline: false
        }
      ],
      footer: {
        text: `Window: ${spotifyAccount.timeRangeLabel(range)}`
      }
    });
  }
};
