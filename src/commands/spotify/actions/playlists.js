const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { resolveTargetMemberAndRest, replyLinkPrompt, pagingPayload, compactNumber } = require('./shared');

module.exports = {
  id: 'playlists',
  aliases: ['library'],
  description: 'Browse public and private playlists from a linked Spotify account.',
  usage: 'spotify playlists [@user]',
  examples: ['spotify playlists', 'spotify playlists @Rumi'],
  async run({ message, args }) {
    const { member } = await resolveTargetMemberAndRest(message, args);
    const account = await spotifyAccount.getFreshAccount(member.id).catch(() => null);
    if (!account) {
      if (member.id === message.author.id) return replyLinkPrompt(message, 'Link your Spotify account first.');
      return respond.reply(message, 'bad', 'That user has not linked Spotify yet.');
    }

    const payload = await spotifyAccount.getPlaylists(member.id, 10).catch(() => null);
    const items = payload?.items || [];
    if (!items.length) return respond.reply(message, 'bad', 'No Spotify playlists were available for that account.');

    const pages = items.map((playlist, index) => ({
      title: `Spotify | Playlist ${index + 1}/${items.length}`,
      allowTitle: true,
      description: [
        `**${playlist.name || 'Untitled playlist'}**`,
        `Owner: **${playlist.owner?.display_name || playlist.owner?.id || 'Unknown'}**`,
        `Tracks: \`${playlist.tracks?.total || 0}\``,
        `Followers: \`${compactNumber(playlist.followers?.total || 0)}\``,
        '',
        playlist.external_urls?.spotify || ''
      ].filter(Boolean).join('\n'),
      thumbnail: playlist.images?.[0]?.url || null,
      footer: {
        text: `Spotify account: ${account.display_name || member.displayName}`
      },
      mentionUser: false
    }));

    return respond.reply(message, 'info', null, pagingPayload('spotify', message.author.id, message.guild?.id, pages));
  }
};
