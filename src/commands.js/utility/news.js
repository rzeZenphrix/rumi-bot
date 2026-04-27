const respond = require('../../utils/respond');

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>');
}

module.exports = {
  name: 'news',
  aliases: ['headlines'],
  category: 'utility',
  description: 'Show current news headlines.',
  usage: 'news [topic]',

  async execute({ message, args }) {
    const topic = args.join(' ').trim();
    const url = topic
      ? `https://news.google.com/rss/search?q=${encodeURIComponent(topic)}`
      : 'https://news.google.com/rss?hl=en-GB&gl=GB&ceid=GB:en';

    const xml = await fetch(url).then((res) => res.text()).catch(() => null);
    if (!xml) return respond.reply(message, 'bad', 'News is unavailable right now.');

    const items = [...xml.matchAll(/<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>/gi)]
      .slice(0, 5)
      .map((match, index) => `**${index + 1}.** ${decodeXml(match[1])}\n${decodeXml(match[2])}`);

    return respond.reply(message, 'info', items.length ? `News${topic ? ` for \`${topic}\`` : ''}:\n\n${items.join('\n\n')}` : 'I could not find any headlines.');
  }
};
