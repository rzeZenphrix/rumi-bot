const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const musicUi = require('../../../systems/music/musicUiV2');
const { resolveTargetMemberAndRest, replyLinkPrompt } = require('./shared');

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

      return respond.reply(message, 'bad', 'That user has not linked Spotify yet.', {
        mentionUser: false
      });
    }

    const playback = await spotifyAccount.getCurrentPlayback(member.id).catch(() => null);
    const item = playback?.item;

    if (item) {
      return message.channel.send(
        musicUi.spotifyNowPlaying({
          memberName: member.displayName,
          accountName: account.display_name,
          item,
          isPlaying: Boolean(playback.is_playing),
          recent: false
        })
      );
    }

    const recent = await spotifyAccount.getRecent(member.id, 1).catch(() => null);
    const track = recent?.items?.[0]?.track;

    if (!track) {
      return respond.reply(message, 'bad', 'No Spotify playback history was available for that account.', {
        mentionUser: false
      });
    }

    return message.channel.send(
      musicUi.spotifyNowPlaying({
        memberName: member.displayName,
        accountName: account.display_name,
        item: track,
        isPlaying: false,
        recent: true
      })
    );
  }
};