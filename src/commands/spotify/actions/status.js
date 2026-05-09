const respond = require('../../../utils/respond');
const spotifyAccount = require('../../../systems/musicAccounts/spotifyAccount');
const { replyLinkPrompt } = require('./shared');

module.exports = {
  id: 'status',
  description: 'Show whether your Spotify account is linked and ready.',
  usage: 'spotify status',
  examples: ['spotify status'],
  async run({ message }) {
    const account = await spotifyAccount.getFreshAccount(message.author.id).catch(() => null);
    if (!account) {
      return replyLinkPrompt(message, 'Your Discord account is not linked to Spotify yet.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Spotify link status',
      description: `Linked as **${account.display_name || account.spotify_user_id || 'Spotify'}**.`,
      fields: [
        {
          name: 'Connected',
          value: account.connected_at ? `<t:${Math.floor(new Date(account.connected_at).getTime() / 1000)}:R>` : 'Unknown',
          inline: true
        },
        {
          name: 'Token expiry',
          value: account.token_expires_at ? `<t:${Math.floor(new Date(account.token_expires_at).getTime() / 1000)}:R>` : 'Unknown',
          inline: true
        }
      ]
    });
  }
};
