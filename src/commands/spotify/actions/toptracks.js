const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { resolveTargetMemberAndRest, replyLinkPrompt, artistsLine } = require('./shared');

module.exports = {
  id: 'toptracks',
  aliases: ['tracks'],
  description: 'Show top Spotify tracks for a linked account.',
  usage: 'spotify toptracks [short|medium|long] [@user]',
  examples: ['spotify toptracks', 'spotify toptracks short @Rumi'],
  async run({ message, args }) {
    const { member, rest } = await resolveTargetMemberAndRest(message, args);
    const range = rest[0] || 'medium';
    const account = await spotifyAccount.getFreshAccount(member.id).catch(() => null);
    if (!account) {
      if (member.id === message.author.id) return replyLinkPrompt(message, 'Link your Spotify account first.');
      return respond.reply(message, 'bad', 'That user has not linked Spotify yet.');
    }

    const top = await spotifyAccount.getTopTracks(member.id, range, 10).catch(() => null);
    const items = top?.items || [];
    if (!items.length) return respond.reply(message, 'bad', 'No Spotify top tracks were available for that account.');

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Spotify | Top Tracks',
      description: items.map((track, index) => (
        `**${index + 1}.** [${track.name}](${track.external_urls?.spotify || track.href || 'https://spotify.com'})\n${artistsLine(track.artists || [])}`
      )).join('\n\n').slice(0, 3800),
      thumbnail: items[0]?.album?.images?.[0]?.url || null,
      footer: {
        text: `${account.display_name || member.displayName} • ${spotifyAccount.timeRangeLabel(range)}`
      }
    });
  }
};
