const SEARCH_URL = 'https://html.duckduckgo.com/html/';

function stripHtml(value = '') {
  return String(value || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeResultUrl(value = '') {
  try {
    const url = new URL(value, 'https://duckduckgo.com');
    const redirect = url.searchParams.get('uddg');
    if (redirect) return decodeURIComponent(redirect);
    return url.href;
  } catch {
    return value;
  }
}

function displayHost(link = '') {
  try {
    const url = new URL(link);
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return String(link || '').replace(/^https?:\/\//i, '').split('/')[0] || 'Unknown source';
  }
}

function parseResults(html = '') {
  const results = [];
  const blocks = html.match(/<div class="result[\s\S]*?(?=<div class="result|<div class="nav-link|<\/body>)/gi) || [];

  for (const block of blocks) {
    const titleMatch = block.match(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!titleMatch) continue;

    const snippetMatch =
      block.match(/<a[^>]*class="result__snippet"[^>]*>[\s\S]*?<\/a>/i) ||
      block.match(/<div[^>]*class="result__snippet"[^>]*>[\s\S]*?<\/div>/i);

    const displayMatch = block.match(/<span[^>]*class="result__url"[^>]*>([\s\S]*?)<\/span>/i);

    const link = decodeResultUrl(titleMatch[1]);
    const title = stripHtml(titleMatch[2]);
    const snippet = stripHtml(snippetMatch?.[0] || 'No preview available.');
    const displayLink = stripHtml(displayMatch?.[1] || displayHost(link));

    if (!title || !link || /duckduckgo\.com\/y\.js/i.test(link)) continue;

    results.push({
      title: title.slice(0, 256),
      link,
      displayLink: displayLink || displayHost(link),
      source: displayHost(link),
      snippet: snippet.slice(0, 900),
      image: null
    });

    if (results.length >= 10) break;
  }

  return results;
}

async function search(query, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.limit || 10)));

  const body = new URLSearchParams();
  body.set('q', query);
  body.set('kl', options.region || process.env.STANDARD_SEARCH_REGION || 'wt-wt');

  const response = await fetch(SEARCH_URL, {
    method: 'POST',
    headers: {
      Accept: 'text/html,application/xhtml+xml',
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        process.env.SEARCH_USER_AGENT ||
        'Mozilla/5.0 (compatible; RumiBot/1.0; Discord bot standard search)'
    },
    body
  }).catch(() => null);

  if (!response) {
    const error = new Error('Search request failed.');
    error.code = 'SEARCH_NETWORK_FAILED';
    throw error;
  }

  if (!response.ok) {
    const error = new Error(`Search returned HTTP ${response.status}.`);
    error.code = 'SEARCH_HTTP_FAILED';
    error.status = response.status;
    throw error;
  }

  const html = await response.text();
  const items = parseResults(html).slice(0, limit);

  return {
    query,
    provider: 'Standard web search',
    sourceProvider: 'DuckDuckGo HTML',
    totalResults: items.length,
    searchTime: 0,
    items
  };
}

function isConfigured() {
  return true;
}

module.exports = {
  isConfigured,
  search,
  parseResults
};