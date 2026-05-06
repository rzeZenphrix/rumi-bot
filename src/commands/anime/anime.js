const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');
const { searchAnime, animePage } = require('../../services/anime/jikan');

module.exports = {
  name: 'anime',
  aliases: ['ani', 'animefinder'],
  category: 'anime',
  description: 'Find anime information from MyAnimeList using a clean paginated embed.',
  usage: 'anime <anime name>',
  examples: [
    'anime tower of god',
    'anime attack on titan',
    'anime frieren'
  ],
  typing: true,

  async execute({ message, args }) {
    const sub = String(args[0] || '').toLowerCase();

    if (['find', 'search', 'lookup'].includes(sub)) {
      args.shift();
    }

    const query = args.join(' ').trim();

    if (!query) {
      return respond.reply(message, 'info', 'Use `anime <anime name>`. Example: `anime tower of god`.');
    }

    const results = await searchAnime(query, 10).catch((error) => ({ error }));

    if (results.error) {
      return respond.reply(message, 'bad', `Anime lookup failed: ${results.error.message}`);
    }

    if (!results.length) {
      return respond.reply(message, 'bad', `I could not find anime results for **${query}**.`);
    }

    const pages = results.map((item, index) =>
      animePage(item, index, results.length, query)
    );

    const payload = createPagedMessage({
      prefix: 'anime',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};