const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const { resolveLastFmTarget, replyLinkPrompt, formatNumber } = require('./shared');

module.exports = {
  id: 'topartists',
  aliases: ['artists'],
  description: 'Show top Last.fm artists.',
  usage: 'lastfm topartists [period] [@user|username]',
  examples: ['lastfm topartists', 'lastfm topartists overall @Rumi'],
  async run({ message, args }) {
    const period = args[0] || '7day';
    const rest = args.slice(1);
    const { username } = await resolveLastFmTarget(message, rest, lastfmAccount.getLinkedUsername);
    if (!username) return replyLinkPrompt(message, 'Link your Last.fm account first.');

    const items = await lastfmAccount.getTop(username, period, 'artists', 10).catch(() => null);
    if (!items?.length) return respond.reply(message, 'bad', 'No Last.fm top artists were found.');

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Last.fm | Top Artists',
      description: items.map((item, index) => `**${index + 1}.** [${item.name}](${item.url || 'https://last.fm'}) — \`${formatNumber(item.playcount)} plays\``).join('\n'),
      thumbnail: items.find((item) => item.image)?.image || null,
      footer: { text: `${username} • ${lastfmAccount.periodLabel(period)}` }
    });
  }
};
