const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');
const { searchManga, mangaPage } = require('../../services/anime/jikan');

module.exports = {
  name: 'manga',
  aliases: ['mangafinder', 'manhwa', 'manhua'],
  category: 'manga',
  description: 'Find manga, manhwa, and manhua information from MyAnimeList.',
  usage: 'manga <manga name>',
  examples: [
    'manga berserk',
    'manga solo leveling',
    'manga one piece'
  ],
  typing: true,

  async execute({ message, args }) {
    const sub = String(args[0] || '').toLowerCase();

    if (['find', 'search', 'lookup'].includes(sub)) {
      args.shift();
    }

    const query = args.join(' ').trim();

    if (!query) {
      return respond.reply(message, 'info', 'Use `manga <manga name>`. Example: `manga berserk`.');
    }

    const results = await searchManga(query, 10).catch((error) => ({ error }));

    if (results.error) {
      return respond.reply(message, 'bad', `Manga lookup failed: ${results.error.message}`);
    }

    if (!results.length) {
      return respond.reply(message, 'bad', `I could not find manga results for **${query}**.`);
    }

    const pages = results.map((item, index) =>
      mangaPage(item, index, results.length, query)
    );

    const payload = createPagedMessage({
      prefix: 'manga',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};