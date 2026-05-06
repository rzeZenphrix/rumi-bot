const respond = require('../../../utils/respond');
const lastfmAccount = require('../../../systems/musicAccounts/lastfmAccount');
const { resolveLastFmTarget, replyLinkPrompt, formatNumber } = require('./shared');

module.exports = {
  id: 'profile',
  aliases: ['user'],
  description: 'Show the linked Last.fm profile for you or another linked Discord user.',
  usage: 'lastfm profile [@user|username]',
  examples: ['lastfm profile', 'lastfm profile @Rumi'],
  async run({ message, args }) {
    const { username, member } = await resolveLastFmTarget(message, args, lastfmAccount.getLinkedUsername);
    if (!username) {
      return replyLinkPrompt(message, 'Link your Last.fm account first.');
    }

    const profile = await lastfmAccount.getProfile(username).catch(() => null);
    const user = profile?.user || {};
    if (!profile?.user) {
      return respond.reply(message, 'bad', 'I could not load that Last.fm profile right now.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: `Last.fm | ${user.realname || user.name || username}`,
      description: [
        user.url || '',
        user.country ? `Country: **${user.country}**` : null,
        user.registered?.unixtime ? `Registered: <t:${user.registered.unixtime}:D>` : null,
        member ? `Linked Discord user: **${member.displayName}**` : null
      ].filter(Boolean).join('\n'),
      thumbnail: user.image?.find?.((img) => img.size === 'large')?.['#text'] || null,
      fields: [
        { name: 'Playcount', value: formatNumber(user.playcount), inline: true },
        { name: 'Playlists', value: formatNumber(user.playlists), inline: true },
        { name: 'Subscribers', value: formatNumber(user.subscriber), inline: true }
      ]
    });
  }
};
