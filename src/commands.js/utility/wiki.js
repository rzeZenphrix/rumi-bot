const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

async function fetchSummary(title) {
  const response = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`).catch(() => null);
  if (!response?.ok) return null;
  return response.json().catch(() => null);
}

async function searchWikipedia(query) {
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&utf8=1&format=json&srlimit=8&origin=*`;
  const response = await fetch(url).catch(() => null);
  if (!response?.ok) return [];
  const payload = await response.json().catch(() => null);
  return payload?.query?.search || [];
}

function cleanSnippet(value) {
  return String(value || '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

module.exports = {
  name: 'wiki',
  aliases: ['wikipedia'],
  category: 'utility',
  description: 'Read a Wikipedia summary or browse search results.',
  usage: 'wiki <topic> | wiki search <topic> | wiki random',
  examples: ['wiki discord', 'wiki search roman empire', 'wiki random'],
  typing: true,

  async execute({ message, args }) {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'random') {
      const randomResponse = await fetch('https://en.wikipedia.org/api/rest_v1/page/random/summary').catch(() => null);
      const randomPage = randomResponse?.ok ? await randomResponse.json().catch(() => null) : null;
      if (!randomPage) return respond.reply(message, 'bad', 'Wikipedia is unavailable right now.');

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Wikipedia | ${randomPage.title}`,
        allowTitle: true,
        thumbnail: randomPage.thumbnail?.source,
        description: `${String(randomPage.extract || 'No summary returned.').slice(0, 1800)}\n\n${randomPage.content_urls?.desktop?.page || ''}`.trim()
      });
    }

    const query = (sub === 'search' ? args.slice(1) : args).join(' ').trim();
    if (!query) return respond.reply(message, 'info', 'Tell me what to search on Wikipedia.');

    if (sub !== 'search') {
      const summary = await fetchSummary(query);
      if (summary?.extract) {
        const related = await searchWikipedia(query);
        const pages = [
          {
            title: `Wikipedia | ${summary.title}`,
            allowTitle: true,
            thumbnail: summary.thumbnail?.source,
            description: `${String(summary.extract || 'No summary returned.').slice(0, 1800)}\n\n${summary.content_urls?.desktop?.page || ''}`.trim(),
            footer: {
              text: 'Page 1 shows the best direct match.'
            }
          }
        ];

        for (const item of related.slice(0, 5)) {
          if (String(item.title).toLowerCase() === String(summary.title).toLowerCase()) continue;
          pages.push({
            title: `Wikipedia search | ${item.title}`,
            allowTitle: true,
            description: `${cleanSnippet(item.snippet)}\n\nhttps://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
            footer: {
              text: `Search result`
            }
          });
        }

        const payload = createPagedMessage({
          prefix: 'wiki',
          ownerId: message.author.id,
          guildId: message.guild?.id,
          type: 'info',
          pages
        });

        return respond.reply(message, 'info', null, payload);
      }
    }

    const results = await searchWikipedia(query);
    if (!results.length) return respond.reply(message, 'bad', 'I could not find any Wikipedia results for that search.');

    const pages = results.map((item) => ({
      title: `Wikipedia search | ${item.title}`,
      allowTitle: true,
      description: `${cleanSnippet(item.snippet)}\n\nhttps://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replaceAll(' ', '_'))}`,
      footer: {
        text: `${item.wordcount || 0} words indexed`
      }
    }));

    const payload = createPagedMessage({
      prefix: 'wiki',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
