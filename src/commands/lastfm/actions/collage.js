const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const { resolveLastFmTarget, replyLinkPrompt } = require('./shared');

module.exports = {
  id: 'collage',
  aliases: ['chart'],
  description: 'Show a chart-style Last.fm album summary.',
  usage: 'lastfm collage [period] [@user|username]',
  examples: ['lastfm collage', 'lastfm collage 1month @Rumi'],
  async run({ message, args }) {
    const period = args[0] || '7day';
    const rest = args.slice(1);
    const { username } = await resolveLastFmTarget(message, rest, lastfmAccount.getLinkedUsername);
    if (!username) return replyLinkPrompt(message, 'Link your Last.fm account first.');

    const albums = await lastfmAccount.getTop(username, period, 'albums', 9).catch(() => null);
    if (!albums?.length) return respond.reply(message, 'bad', 'No Last.fm album chart data was found.');

    const rows = [];
    for (let index = 0; index < albums.length; index += 3) {
      rows.push(albums.slice(index, index + 3).map((album) => `**${album.name}**${album.artist ? `\n${album.artist}` : ''}`).join('\n\n` • `\n\n'));
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Last.fm | Collage',
      description: rows.join('\n\n────────────\n\n'),
      thumbnail: albums.find((album) => album.image)?.image || null,
      footer: { text: `${username} • ${lastfmAccount.periodLabel(period)}` }
    });
  }
};
