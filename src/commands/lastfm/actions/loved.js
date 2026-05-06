const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const { resolveLastFmTarget, replyLinkPrompt, pagingPayload, unix } = require('./shared');

module.exports = {
  id: 'loved',
  description: 'Browse loved Last.fm tracks.',
  usage: 'lastfm loved [@user|username]',
  examples: ['lastfm loved', 'lastfm loved @Rumi'],
  async run({ message, args }) {
    const { username } = await resolveLastFmTarget(message, args, lastfmAccount.getLinkedUsername);
    if (!username) return replyLinkPrompt(message, 'Link your Last.fm account first.');

    const tracks = await lastfmAccount.getLoved(username, 10).catch(() => null);
    if (!tracks?.length) return respond.reply(message, 'bad', 'No loved Last.fm tracks were found.');

    const pages = tracks.map((track, index) => ({
      title: `Last.fm | Loved ${index + 1}/${tracks.length}`,
      allowTitle: true,
      description: [
        `**${track.name}**`,
        `by **${track.artist}**`,
        track.album ? `Album: **${track.album}**` : null,
        track.lovedAt ? `Loved ${unix(track.lovedAt)}` : null,
        '',
        track.url
      ].filter(Boolean).join('\n'),
      thumbnail: track.image || null,
      footer: { text: `Last.fm user: ${username}` },
      mentionUser: false
    }));

    return respond.reply(message, 'info', null, pagingPayload('lastfm', message.author.id, message.guild?.id, pages));
  }
};
