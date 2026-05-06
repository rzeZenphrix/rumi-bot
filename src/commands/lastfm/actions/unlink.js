const respond = require('../../../utils/respond');
const store = require('../../../systems/musicAccounts/store');

module.exports = {
  id: 'unlink',
  aliases: ['remove'],
  description: 'Disconnect your Last.fm account from Rumi.',
  usage: 'lastfm unlink',
  examples: ['lastfm unlink'],
  async run({ message }) {
    const existing = await store.getLastFmAccount(message.author.id).catch(() => null);
    if (!existing) {
      return respond.reply(message, 'info', 'Your Discord account is not linked to Last.fm right now.');
    }

    await store.deleteLastFmAccount(message.author.id).catch(() => null);
    return respond.reply(message, 'good', `Disconnected **${existing.username || existing.display_name || 'Last.fm'}** from your Rumi account.`);
  }
};
