const respond = require('../../utils/respond');
const { extractUrl } = require('../../services/google/tenor');
const { requireUserPremium } = require('../../systems/monetization/access');

function findMeta(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  return html.match(re)?.[1]?.replaceAll('&amp;', '&') || null;
}

module.exports = {
  name: 'linkpreview',
  aliases: ['preview', 'lp'],
  category: 'utility',
  description: 'I fetch basic metadata for a URL.',
  usage: 'linkpreview <url>',
  examples: ['linkpreview https://example.com'],
  typing: true,

  async execute({ message, args }) {
    const access = await requireUserPremium(message, 'Link preview').catch(() => null);
    if (!access) return null;

    const url = extractUrl(args.join(' '));
    if (!url) return respond.reply(message, 'info', 'Use `linkpreview <url>`.');
    const res = await fetch(url, { headers: { 'user-agent': 'RumiBot/0.2' } });
    if (!res.ok) return respond.reply(message, 'bad', `I could not fetch that link: HTTP ${res.status}.`);
    const html = await res.text();
    const title = findMeta(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || url;
    const description = findMeta(html, 'og:description') || findMeta(html, 'description') || 'No description found.';
    const image = findMeta(html, 'og:image');
    return respond.reply(message, 'info', null, { title: title.slice(0, 256), description: description.slice(0, 2048), image: image || undefined, footer: { text: url.slice(0, 2048) } });
  }
};
