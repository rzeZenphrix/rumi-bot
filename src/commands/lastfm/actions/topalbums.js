const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const { resolveLastFmTarget, replyLinkPrompt, formatNumber } = require('./shared');

module.exports = {
  id: 'topalbums',
  aliases: ['albums'],
  description: 'Show top Last.fm albums.',
  usage: 'lastfm topalbums [period] [@user|username]',
  examples: ['lastfm topalbums', 'lastfm topalbums 3month @Rumi'],
  async run({ message, args }) {
    const period = args[0] || '7day';
    const rest = args.slice(1);
    const { username } = await resolveLastFmTarget(message, rest, lastfmAccount.getLinkedUsername);
    if (!username) return replyLinkPrompt(message, 'Link your Last.fm account first.');

    const items = await lastfmAccount.getTop(username, period, 'albums', 10).catch(() => null);
    if (!items?.length) return respond.reply(message, 'bad', 'No Last.fm top albums were found.');

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Last.fm | Top Albums',
      description: items.map((item, index) => `**${index + 1}.** [${item.name}](${item.url || 'https://last.fm'})${item.artist ? ` — ${item.artist}` : ''} — \`${formatNumber(item.playcount)} plays\``).join('\n'),
      thumbnail: items.find((item) => item.image)?.image || null,
      footer: { text: `${username} • ${lastfmAccount.periodLabel(period)}` }
    });
  }
};
