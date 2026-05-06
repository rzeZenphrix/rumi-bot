const respond = require('../../../utils/respond');
const { createLinkComponents } = require('../../../systems/musicAccounts/shared');

module.exports = {
  id: 'link',
  description: 'Create a secure one-time Last.fm link for your Discord account.',
  usage: 'lastfm link',
  examples: ['lastfm link'],
  async run({ message }) {
    const { session, components } = await createLinkComponents('lastfm', message.author.id, {
      source: 'bot',
      metadata: { command: 'lastfm link', requestedAt: new Date().toISOString() }
    });

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Connect Last.fm',
      description: `Open the button below to link Last.fm to your Discord account.\n\nThis one-time link expires <t:${Math.floor(new Date(session.expires_at).getTime() / 1000)}:R>.`,
      components
    });
  }
};
