const { lookupSpotifyQuery } = require('./shared');

module.exports = {
  id: 'artist',
  description: 'Search Spotify for an artist.',
  usage: 'spotify artist <query>',
  examples: ['spotify artist chappell roan'],
  async run({ message, args }) {
    return lookupSpotifyQuery(message, 'artist', args.join(' '));
  }
};
