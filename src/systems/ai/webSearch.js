const cheerio = require('cheerio');

const DEFAULT_MAX_RESULTS = Number(process.env.AI_WEB_SEARCH_MAX_RESULTS || 5);
const DEFAULT_TIMEOUT_MS = Number(process.env.AI_WEB_SEARCH_TIMEOUT_MS || 6000);

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function shouldUseWebSearch(query) {
  if (!envFlag('AI_WEB_SEARCH_ENABLED', false)) return false;

  const text = String(query || '').toLowerCase();
  if (!text.trim()) return false;

  return /\b(today|latest|current|now|news|live|price|release|version|search|google|web|look up|lookup|who is|what is the latest)\b/.test(text);
}

async function fetchText(url, timeoutMs = DEFAULT_TIMEOUT_MS, headers = {}) {
  const safeTimeoutMs = Number(timeoutMs || DEFAULT_TIMEOUT_MS);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), safeTimeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        ...headers
      }
    });

    if (!response.ok) {
      const error = new Error(`Search provider returned ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

function unwrapDuckDuckGoUrl(url) {
  try {
    const parsed = new URL(url, 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    return uddg || parsed.href;
  } catch {
    return url;
  }
}

async function duckDuckGoHtmlSearch(query, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.maxResults || DEFAULT_MAX_RESULTS)));
  const params = new URLSearchParams({ q: String(query || '').slice(0, 256) });
  const html = await fetchText(`https://html.duckduckgo.com/html/?${params.toString()}`, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const $ = cheerio.load(html);
  const results = [];

  $('.result').each((_index, element) => {
    if (results.length >= limit) return false;
    const link = $(element).find('.result__a').first();
    const title = link.text().replace(/\s+/g, ' ').trim();
    const url = unwrapDuckDuckGoUrl(link.attr('href') || '');
    const snippet = $(element).find('.result__snippet').text().replace(/\s+/g, ' ').trim();

    if (title && /^https?:\/\//i.test(url)) {
      results.push({
        title,
        url,
        snippet,
        source: new URL(url).hostname.replace(/^www\./, ''),
        provider: 'duckduckgo'
      });
    }
    return undefined;
  });

  return results;
}

async function duckDuckGoLiteSearch(query, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.maxResults || DEFAULT_MAX_RESULTS)));
  const params = new URLSearchParams({ q: String(query || '').slice(0, 256) });
  const html = await fetchText(`https://lite.duckduckgo.com/lite/?${params.toString()}`, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const $ = cheerio.load(html);
  const results = [];

  $('a').each((_index, element) => {
    if (results.length >= limit) return false;
    const title = $(element).text().replace(/\s+/g, ' ').trim();
    const href = $(element).attr('href') || '';
    if (!href.includes('uddg=')) return undefined;
    const url = unwrapDuckDuckGoUrl(href);
    if (title && /^https?:\/\//i.test(url)) {
      results.push({
        title,
        url,
        snippet: '',
        source: new URL(url).hostname.replace(/^www\./, ''),
        provider: 'duckduckgo'
      });
    }
    return undefined;
  });

  return results;
}

async function duckDuckGoInstantAnswer(query, options = {}) {
  const limit = Math.max(1, Math.min(10, Number(options.maxResults || DEFAULT_MAX_RESULTS)));
  const params = new URLSearchParams({
    q: String(query || '').slice(0, 256),
    format: 'json',
    no_html: '1',
    skip_disambig: '1'
  });
  const raw = await fetchText(`https://api.duckduckgo.com/?${params.toString()}`, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const data = JSON.parse(raw);
  const results = [];

  if (data.AbstractText) {
    results.push({
      title: data.Heading || data.AbstractSource || 'DuckDuckGo result',
      url: data.AbstractURL || 'https://duckduckgo.com/',
      snippet: data.AbstractText,
      source: data.AbstractSource || 'duckduckgo',
      provider: 'duckduckgo'
    });
  }

  for (const topic of data.RelatedTopics || []) {
    if (results.length >= limit) break;
    if (!topic.Text) continue;
    results.push({
      title: topic.FirstURL ? topic.FirstURL.replace(/^https?:\/\//, '') : 'Related result',
      url: topic.FirstURL || 'https://duckduckgo.com/',
      snippet: topic.Text,
      source: 'duckduckgo',
      provider: 'duckduckgo'
    });
  }

  return results.slice(0, limit);
}

async function duckDuckGoSearch(query, options = {}) {
  const htmlResults = await duckDuckGoHtmlSearch(query, options).catch(() => []);
  if (htmlResults.length) return htmlResults;
  const liteResults = await duckDuckGoLiteSearch(query, options).catch(() => []);
  if (liteResults.length) return liteResults;
  return duckDuckGoInstantAnswer(query, options).catch(() => []);
}

async function searchWeb(query, options = {}) {
  if (!shouldUseWebSearch(query)) return [];

  const provider = String(process.env.AI_WEB_SEARCH_PROVIDER || 'duckduckgo').toLowerCase();

  if (provider === 'duckduckgo' || provider === 'ddg' || provider === 'google') {
    return duckDuckGoSearch(query, options);
  }

  return [];
}

module.exports = {
  shouldUseWebSearch,
  searchWeb
};
