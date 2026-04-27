const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

function isConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getAccessToken() {
  if (!isConfigured()) {
    const error = new Error('Spotify API credentials are not configured.');
    error.code = 'SPOTIFY_NOT_CONFIGURED';
    throw error;
  }

  if (tokenCache.accessToken && tokenCache.expiresAt > Date.now() + 15000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(
    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`,
    'utf8'
  ).toString('base64');

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });

  if (!response.ok) {
    const error = new Error(`Spotify token request failed with ${response.status}.`);
    error.code = 'SPOTIFY_TOKEN_FAILED';
    throw error;
  }

  const payload = await response.json();
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (Number(payload.expires_in || 3600) * 1000)
  };

  return tokenCache.accessToken;
}

async function spotifyFetch(path, options = {}) {
  const token = await getAccessToken();
  const url = new URL(`${API_BASE}${path}`);
  if (options.query) {
    for (const [key, value] of Object.entries(options.query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    const error = new Error(`Spotify API returned ${response.status}.`);
    error.code = 'SPOTIFY_API_FAILED';
    error.status = response.status;
    throw error;
  }

  return response.json();
}

function parseSpotifyInput(input = '') {
  const value = String(input || '').trim();
  const urlMatch = value.match(/spotify\.com\/(track|artist|album|playlist)\/([A-Za-z0-9]+)/i);
  if (urlMatch) {
    return { type: urlMatch[1].toLowerCase(), id: urlMatch[2], mode: 'url' };
  }

  const uriMatch = value.match(/^spotify:(track|artist|album|playlist):([A-Za-z0-9]+)$/i);
  if (uriMatch) {
    return { type: uriMatch[1].toLowerCase(), id: uriMatch[2], mode: 'uri' };
  }

  return null;
}

async function getEntity(type, id, market = process.env.SPOTIFY_MARKET || 'GB') {
  const query = ['track', 'album'].includes(type) ? { market } : undefined;
  return spotifyFetch(`/${type}s/${id}`, { query });
}

async function search(query, type = 'track,artist,album,playlist', limit = 5, market = process.env.SPOTIFY_MARKET || 'GB') {
  return spotifyFetch('/search', {
    query: {
      q: query,
      type,
      limit,
      market
    }
  });
}

module.exports = {
  isConfigured,
  parseSpotifyInput,
  getEntity,
  search
};
