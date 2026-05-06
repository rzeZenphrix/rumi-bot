const { lookupSpotifyQuery } = require('./shared');

module.exports = {
  id: 'album',
  description: 'Search Spotify for an album.',
  usage: 'spotify album <query>',
  examples: ['spotify album brat'],
  async run({ message, args }) {
    return lookupSpotifyQuery(message, 'album', args.join(' '));
  }
};
