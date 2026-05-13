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

async function fetchJson(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'RumiBot/1.0 (+https://discord.com)'
      }
    });

    if (!response.ok) {
      const error = new Error(`Search provider returned ${response.status}`);
      error.status = response.status;
      throw error;
    }

    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function googleSearch(query, options = {}) {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const engineId = process.env.GOOGLE_SEARCH_ENGINE_ID;
  if (!apiKey || !engineId) return [];

  const limit = Math.max(1, Math.min(10, Number(options.maxResults || DEFAULT_MAX_RESULTS)));
  const params = new URLSearchParams({
    key: apiKey,
    cx: engineId,
    q: String(query || '').slice(0, 256),
    num: String(limit),
    safe: 'active'
  });

  const data = await fetchJson(`https://www.googleapis.com/customsearch/v1?${params.toString()}`, options.timeoutMs);
  return (data.items || []).slice(0, limit).map((item) => ({
    title: item.title || item.displayLink || 'Web result',
    url: item.link,
    snippet: item.snippet || '',
    source: item.displayLink || item.link || 'google',
    provider: 'google'
  })).filter((item) => item.url);
}

async function searchWeb(query, options = {}) {
  if (!shouldUseWebSearch(query)) return [];

  const provider = String(process.env.AI_WEB_SEARCH_PROVIDER || 'google').toLowerCase();

  if (provider === 'google') {
    return googleSearch(query, options).catch(() => []);
  }

  return [];
}

module.exports = {
  shouldUseWebSearch,
  searchWeb
};
