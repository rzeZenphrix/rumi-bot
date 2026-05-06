const { lookupSpotifyQuery } = require('./shared');

module.exports = {
  id: 'track',
  description: 'Search Spotify for a track.',
  usage: 'spotify track <query>',
  examples: ['spotify track pink pony club'],
  async run({ message, args }) {
    return lookupSpotifyQuery(message, 'track', args.join(' '));
  }
};
