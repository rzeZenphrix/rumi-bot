const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { resolveTargetMemberAndRest, replyLinkPrompt, compactNumber } = require('./shared');

module.exports = {
  id: 'topartists',
  aliases: ['artists'],
  description: 'Show top Spotify artists for a linked account.',
  usage: 'spotify topartists [short|medium|long] [@user]',
  examples: ['spotify topartists', 'spotify topartists long @Rumi'],
  async run({ message, args }) {
    const { member, rest } = await resolveTargetMemberAndRest(message, args);
    const range = rest[0] || 'medium';
    const account = await spotifyAccount.getFreshAccount(member.id).catch(() => null);
    if (!account) {
      if (member.id === message.author.id) return replyLinkPrompt(message, 'Link your Spotify account first.');
      return respond.reply(message, 'bad', 'That user has not linked Spotify yet.');
    }

    const top = await spotifyAccount.getTopArtists(member.id, range, 10).catch(() => null);
    const items = top?.items || [];
    if (!items.length) return respond.reply(message, 'bad', 'No Spotify top artists were available for that account.');

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Spotify | Top Artists',
      description: items.map((artist, index) => (
        `**${index + 1}.** [${artist.name}](${artist.external_urls?.spotify || artist.href || 'https://spotify.com'})\nFollowers: \`${compactNumber(artist.followers?.total || 0)}\`${artist.genres?.length ? ` • ${artist.genres.slice(0, 3).join(', ')}` : ''}`
      )).join('\n\n').slice(0, 3800),
      thumbnail: items[0]?.images?.[0]?.url || null,
      footer: {
        text: `${account.display_name || member.displayName} • ${spotifyAccount.timeRangeLabel(range)}`
      }
    });
  }
};
