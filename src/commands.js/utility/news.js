const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

function parseItems(xml) {
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].map((match) => {
    const item = match[1];
    const title = decodeXml(item.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || 'Untitled');
    const link = decodeXml(item.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || '');
    const source = decodeXml(item.match(/<source[^>]*>([\s\S]*?)<\/source>/i)?.[1] || 'Google News');
    const pubDate = decodeXml(item.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || '');
    const description = decodeXml(item.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    return { title, link, source, pubDate, description };
  });
}

module.exports = {
  name: 'news',
  aliases: ['headlines'],
  category: 'utility',
  description: 'Browse current news headlines in a paged embed.',
  usage: 'news [topic]',
  examples: ['news', 'news gaming'],
  typing: true,

  async execute({ message, args }) {
    const topic = args.join(' ').trim();
    const url = topic
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}`
      : 'https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en';

    const xml = await fetch(url).then((res) => res.text()).catch(() => null);
    if (!xml) return respond.reply(message, 'bad', 'News is unavailable right now.');

    const items = parseItems(xml).slice(0, 10);
    if (!items.length) return respond.reply(message, 'bad', 'I could not find any headlines right now.');

    const pages = items.map((item, index) => ({
      title: item.title,
      allowTitle: true,
      description: `${item.description || 'No summary available.'}\n\n${item.link}`.slice(0, 2000),
      fields: [
        { name: 'Source', value: item.source || 'Google News', inline: true },
        { name: 'Published', value: item.pubDate || 'Unknown', inline: true },
        { name: 'Position', value: `${index + 1}/${items.length}`, inline: true }
      ],
      footer: {
        text: topic ? `News for ${topic}` : 'Top headlines'
      }
    }));

    const payload = createPagedMessage({
      prefix: 'news',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, payload);
  }
};
