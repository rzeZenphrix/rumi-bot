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
  description: 'Fetch a richer metadata preview for a URL.',
  usage: 'linkpreview <url>',
  examples: ['linkpreview https://example.com'],
  typing: true,

  async execute({ message, args }) {
    const access = await requireUserPremium(message, 'Link preview').catch(() => null);
    if (!access) return null;

    const url = extractUrl(args.join(' '));
    if (!url) return respond.reply(message, 'info', 'Use `linkpreview <url>`.');

    const res = await fetch(url, { headers: { 'user-agent': 'RumiBot/0.2' } }).catch(() => null);
    if (!res) return respond.reply(message, 'bad', 'I could not fetch that link right now.');

    const contentType = res.headers.get('content-type') || 'unknown';
    if (!res.ok) return respond.reply(message, 'bad', `I could not fetch that link: HTTP ${res.status}.`);

    if (!contentType.includes('text/html')) {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Link preview',
        allowTitle: true,
        description: url,
        fields: [
          { name: 'Content type', value: contentType, inline: true },
          { name: 'HTTP status', value: String(res.status), inline: true }
        ]
      });
    }

    const html = await res.text();
    const title = findMeta(html, 'og:title') || html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || url;
    const description = findMeta(html, 'og:description') || findMeta(html, 'description') || 'No description found.';
    const image = findMeta(html, 'og:image');
    const siteName = findMeta(html, 'og:site_name');
    const canonical = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1] || url;

    return respond.reply(message, 'info', null, {
      title: title.slice(0, 256),
      description: description.slice(0, 2048),
      image: image || undefined,
      fields: [
        { name: 'Site', value: siteName || new URL(url).hostname, inline: true },
        { name: 'HTTP status', value: String(res.status), inline: true },
        { name: 'Type', value: contentType, inline: true },
        { name: 'Canonical URL', value: canonical.slice(0, 1024), inline: false }
      ],
      footer: { text: url.slice(0, 2048) }
    });
  }
};
