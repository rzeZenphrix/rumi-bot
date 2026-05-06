const respond = require('../../../utils/respond');
const store = require('../../../systems/musicAccounts/store');

module.exports = {
  id: 'unlink',
  description: 'Disconnect your Spotify account from Rumi.',
  usage: 'spotify unlink',
  examples: ['spotify unlink'],
  async run({ message }) {
    const existing = await store.getSpotifyAccount(message.author.id).catch(() => null);
    if (!existing) {
      return respond.reply(message, 'info', 'Your Discord account is not linked to Spotify right now.');
    }

    await store.deleteSpotifyAccount(message.author.id).catch(() => null);
    return respond.reply(message, 'good', `Disconnected **${existing.display_name || 'Spotify'}** from your Rumi account.`);
  }
};
