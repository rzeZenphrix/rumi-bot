const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { resolveTargetMemberAndRest, replyLinkPrompt, compactNumber } = require('./shared');

module.exports = {
  id: 'profile',
  aliases: ['user'],
  description: 'Show the linked Spotify profile for you or another linked Discord user.',
  usage: 'spotify profile [@user]',
  examples: ['spotify profile', 'spotify profile @Rumi'],
  async run({ message, args }) {
    const { member } = await resolveTargetMemberAndRest(message, args);
    const account = await spotifyAccount.getFreshAccount(member.id).catch(() => null);

    if (!account) {
      if (member.id === message.author.id) {
        return replyLinkPrompt(message, 'Link your Spotify account first.');
      }
      return respond.reply(message, 'bad', 'That user has not linked Spotify yet.');
    }

    const profile = await spotifyAccount.getProfile(member.id).catch(() => null);
    if (!profile) {
      return respond.reply(message, 'bad', 'I could not load that Spotify profile right now.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: `Spotify | ${profile.display_name || profile.id || member.displayName}`,
      description: [
        profile.external_urls?.spotify || '',
        profile.country ? `Country: **${profile.country}**` : null,
        profile.product ? `Plan: **${profile.product}**` : null,
        profile.email ? `Email: \`${profile.email}\`` : null
      ].filter(Boolean).join('\n'),
      thumbnail: profile.images?.[0]?.url || account.avatar_url || null,
      fields: [
        {
  id: 'Followers',
          value: compactNumber(profile.followers?.total || 0),
          inline: true
        },
        {
  id: 'Spotify ID',
          value: String(profile.id || account.spotify_user_id || 'Unknown'),
          inline: true
        },
        {
  id: 'Linked',
          value: account.connected_at ? `<t:${Math.floor(new Date(account.connected_at).getTime() / 1000)}:R>` : 'Unknown',
          inline: true
        }
      ]
    });
  }
};
