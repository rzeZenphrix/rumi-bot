const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { resolveTargetMemberAndRest, replyLinkPrompt, artistsLine } = require('./shared');

module.exports = {
  id: 'nowplaying',
  aliases: ['np', 'playing'],
  description: 'Show what a linked Spotify account is playing right now, or the most recent track.',
  usage: 'spotify nowplaying [@user]',
  examples: ['spotify nowplaying', 'spotify np @Rumi'],
  async run({ message, args }) {
    const { member } = await resolveTargetMemberAndRest(message, args);
    const account = await spotifyAccount.getFreshAccount(member.id).catch(() => null);
    if (!account) {
      if (member.id === message.author.id) return replyLinkPrompt(message, 'Link your Spotify account first.');
      return respond.reply(message, 'bad', 'That user has not linked Spotify yet.');
    }

    const playback = await spotifyAccount.getCurrentPlayback(member.id).catch(() => null);
    const item = playback?.item;

    if (item) {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: playback.is_playing ? 'Spotify | Now Playing' : 'Spotify | Last Open Track',
        description: [
          `**${item.name}**`,
          `by **${artistsLine(item.artists)}**`,
          item.album?.name ? `Album: **${item.album.name}**` : null,
          item.external_urls?.spotify || null
        ].filter(Boolean).join('\n'),
        thumbnail: item.album?.images?.[0]?.url || null,
        footer: {
          text: playback.is_playing ? `Listening as ${account.display_name || member.displayName}` : `Recent activity for ${account.display_name || member.displayName}`
        }
      });
    }

    const recent = await spotifyAccount.getRecent(member.id, 1).catch(() => null);
    const track = recent?.items?.[0]?.track;
    if (!track) {
      return respond.reply(message, 'bad', 'No Spotify playback history was available for that account.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Spotify | Recently Played',
      description: [
        `**${track.name}**`,
        `by **${artistsLine(track.artists)}**`,
        track.album?.name ? `Album: **${track.album.name}**` : null,
        track.external_urls?.spotify || null
      ].filter(Boolean).join('\n'),
      thumbnail: track.album?.images?.[0]?.url || null,
      footer: {
        text: `Recent activity for ${account.display_name || member.displayName}`
      }
    });
  }
};
