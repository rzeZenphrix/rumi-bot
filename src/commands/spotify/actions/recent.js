const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { resolveTargetMemberAndRest, replyLinkPrompt, artistsLine, pagingPayload } = require('./shared');

module.exports = {
  id: 'recent',
  aliases: ['history'],
  description: 'Browse recently played Spotify tracks for a linked account.',
  usage: 'spotify recent [@user]',
  examples: ['spotify recent', 'spotify recent @Rumi'],
  async run({ message, args }) {
    const { member } = await resolveTargetMemberAndRest(message, args);
    const account = await spotifyAccount.getFreshAccount(member.id).catch(() => null);
    if (!account) {
      if (member.id === message.author.id) return replyLinkPrompt(message, 'Link your Spotify account first.');
      return respond.reply(message, 'bad', 'That user has not linked Spotify yet.');
    }

    const recent = await spotifyAccount.getRecent(member.id, 10).catch(() => null);
    const items = recent?.items || [];
    if (!items.length) {
      return respond.reply(message, 'bad', 'No recent Spotify tracks were available for that account.');
    }

    const pages = items.map((entry, index) => {
      const track = entry.track || {};
      return {
        title: `Spotify | Recent ${index + 1}/${items.length}`,
        allowTitle: true,
        description: [
          `**${track.name || 'Unknown track'}**`,
          `by **${artistsLine(track.artists || [])}**`,
          track.album?.name ? `Album: **${track.album.name}**` : null,
          entry.played_at ? `Played <t:${Math.floor(new Date(entry.played_at).getTime() / 1000)}:R>` : null,
          '',
          track.external_urls?.spotify || ''
        ].filter(Boolean).join('\n'),
        thumbnail: track.album?.images?.[0]?.url || null,
        footer: {
          text: `Spotify account: ${account.display_name || member.displayName}`
        },
        mentionUser: false
      };
    });

    return respond.reply(message, 'info', null, pagingPayload('spotify', message.author.id, message.guild?.id, pages));
  }
};
