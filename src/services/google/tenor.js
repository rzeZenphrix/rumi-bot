function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s<>)]+/i);
  return match ? match[0].replace(/[.,!?]+$/, '') : null;
}

function isTenorUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('tenor.com');
  } catch {
    return false;
  }
}

function extractTenorId(url) {
  const raw = String(url || '');
  const fromGifSlug = raw.match(/(?:-|\/)(\d{8,})(?:[/?#]|$)/);
  if (fromGifSlug) return fromGifSlug[1];
  const fromParam = raw.match(/[?&]id=(\d+)/);
  return fromParam ? fromParam[1] : null;
}

function mediaFromTenorResult(result) {
  const formats = result?.media_formats || {};
  const preferred = [
    ['gif', 'image/gif'],
    ['mediumgif', 'image/gif'],
    ['tinygif', 'image/gif'],
    ['nanogif', 'image/gif'],
    ['webp', 'image/webp'],
    ['tinywebp', 'image/webp'],
    ['mp4', 'video/mp4'],
    ['loopedmp4', 'video/mp4'],
    ['webm', 'video/webm'],
    ['tinywebm', 'video/webm']
  ];

  for (const [key, type] of preferred) {
    const url = formats[key]?.url;
    if (url) {
      return {
        url,
        name: `tenor-${result.id || Date.now()}.${type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : type.includes('webm') ? 'webm' : 'mp4'}`,
        contentType: type,
        source: 'tenor-api',
        metadata: { tenorId: result.id, format: key }
      };
    }
  }

  return null;
}

async function resolveViaApi(url) {
  const key = process.env.GOOGLE_API_KEY || process.env.google;
  const id = extractTenorId(url);
  if (!key || !id) return null;

  const endpoint = new URL('https://tenor.googleapis.com/v2/posts');
  endpoint.searchParams.set('ids', id);
  endpoint.searchParams.set('key', key);
  endpoint.searchParams.set('media_filter', 'gif,mediumgif,tinygif,webp,tinywebp,mp4,loopedmp4,webm,tinywebm');
  endpoint.searchParams.set('client_key', 'ohara-bot');

  const response = await fetch(endpoint, { headers: { accept: 'application/json' } });
  if (!response.ok) return null;
  const payload = await response.json();
  return mediaFromTenorResult(payload?.results?.[0]);
}

function htmlDecode(value) {
  return String(value || '')
    .replaceAll('\\u002F', '/')
    .replaceAll('\\/', '/')
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#x2F;', '/');
}

function pickFromHtml(html) {
  const decoded = htmlDecode(html);
  const patterns = [
    [/https?:\/\/media\.tenor\.com\/[^"'<>\\\s]+?\.gif(?:\?[^"'<>\\\s]+)?/gi, 'image/gif'],
    [/https?:\/\/media\.tenor\.com\/[^"'<>\\\s]+?\.webp(?:\?[^"'<>\\\s]+)?/gi, 'image/webp'],
    [/https?:\/\/media\.tenor\.com\/[^"'<>\\\s]+?\.mp4(?:\?[^"'<>\\\s]+)?/gi, 'video/mp4'],
    [/https?:\/\/media\.tenor\.com\/[^"'<>\\\s]+?\.webm(?:\?[^"'<>\\\s]+)?/gi, 'video/webm']
  ];

  for (const [pattern, contentType] of patterns) {
    const matches = [...decoded.matchAll(pattern)].map((m) => htmlDecode(m[0])).filter(Boolean);
    const preferred = matches.find((m) => /tenor\.gif|mediumgif|gif/i.test(m)) || matches[0];
    if (preferred) {
      const ext = contentType.split('/')[1].replace('mpeg', 'mp4');
      return { url: preferred, name: `tenor.${ext}`, contentType, source: 'tenor-html' };
    }
  }

  return null;
}

async function resolveViaHtml(url) {
  const response = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
  });

  if (!response.ok) return null;
  return pickFromHtml(await response.text());
}

async function resolveTenorUrl(url) {
  if (!isTenorUrl(url)) return null;

  if (String(url).includes('media.tenor.com')) {
    const lower = String(url).split('?')[0].toLowerCase();
    if (lower.endsWith('.gif')) return { url, name: 'tenor.gif', contentType: 'image/gif', source: 'tenor-direct' };
    if (lower.endsWith('.webp')) return { url, name: 'tenor.webp', contentType: 'image/webp', source: 'tenor-direct' };
    if (lower.endsWith('.mp4')) return { url, name: 'tenor.mp4', contentType: 'video/mp4', source: 'tenor-direct' };
    if (lower.endsWith('.webm')) return { url, name: 'tenor.webm', contentType: 'video/webm', source: 'tenor-direct' };
  }

  return (await resolveViaApi(url)) || (await resolveViaHtml(url));
}

module.exports = {
  extractUrl,
  isTenorUrl,
  extractTenorId,
  resolveTenorUrl
};
