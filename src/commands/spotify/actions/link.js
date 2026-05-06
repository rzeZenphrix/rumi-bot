const { createLinkComponents } = require('../../../systems/musicAccounts/shared');
const respond = require('../../../utils/respond');

module.exports = {
  id: 'link',
  description: 'Create a secure one-time Spotify link for your Discord account.',
  usage: 'spotify link',
  examples: ['spotify link'],
  async run({ message }) {
    const { session, components } = await createLinkComponents('spotify', message.author.id, {
      source: 'bot',
      metadata: { command: 'spotify link', requestedAt: new Date().toISOString() }
    });

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Connect Spotify',
      description: `Open the button below to link Spotify to your Discord account.\n\nThis one-time link expires <t:${Math.floor(new Date(session.expires_at).getTime() / 1000)}:R>.`,
      components
    });
  }
};
