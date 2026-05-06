const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';
const AUTHORIZE_URL = 'https://accounts.spotify.com/authorize';
const DEFAULT_SCOPES = 'user-read-email user-read-private user-read-currently-playing user-read-recently-played user-top-read playlist-read-private playlist-read-collaborative';

let tokenCache = {
  accessToken: null,
  expiresAt: 0
};

function isConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

function spotifyRedirectUri() {
  return (
    process.env.SPOTIFY_REDIRECT_URI
    || process.env.RUMI_SPOTIFY_REDIRECT_URI
    || `${(process.env.PUBLIC_SITE_URL || process.env.DASHBOARD_PUBLIC_URL || process.env.BOT_WEBSITE || 'https://rumi.rocks').replace(/\/+$/, '')}/auth/spotify/callback`
  );
}

function spotifyScopes() {
  return String(process.env.SPOTIFY_SCOPES || DEFAULT_SCOPES).trim() || DEFAULT_SCOPES;
}

function buildAuthorizeUrl(state, options = {}) {
  if (!isConfigured()) {
    const error = new Error('Spotify API credentials are not configured.');
    error.code = 'SPOTIFY_NOT_CONFIGURED';
    throw error;
  }

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', process.env.SPOTIFY_CLIENT_ID);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('redirect_uri', String(options.redirectUri || spotifyRedirectUri()));
  url.searchParams.set('scope', String(options.scope || spotifyScopes()));
  url.searchParams.set('state', String(state || ''));
  url.searchParams.set('show_dialog', String(options.showDialog ?? true));
  return url.toString();
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
  return userSpotifyFetch(token, path, options);
}

async function userSpotifyFetch(accessToken, path, options = {}) {
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
      Authorization: `Bearer ${accessToken}`
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

async function exchangeAuthorizationCode(code, options = {}) {
  if (!isConfigured()) {
    const error = new Error('Spotify API credentials are not configured.');
    error.code = 'SPOTIFY_NOT_CONFIGURED';
    throw error;
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
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: String(code || ''),
      redirect_uri: String(options.redirectUri || spotifyRedirectUri())
    }).toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || `Spotify token request failed with ${response.status}.`);
    error.code = 'SPOTIFY_CODE_EXCHANGE_FAILED';
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function refreshUserAccessToken(refreshToken) {
  if (!isConfigured()) {
    const error = new Error('Spotify API credentials are not configured.');
    error.code = 'SPOTIFY_NOT_CONFIGURED';
    throw error;
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
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: String(refreshToken || '')
    }).toString()
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error_description || payload.error || `Spotify refresh request failed with ${response.status}.`);
    error.code = 'SPOTIFY_REFRESH_FAILED';
    error.status = response.status;
    throw error;
  }

  return payload;
}

async function fetchUserProfile(accessToken) {
  return userSpotifyFetch(accessToken, '/me');
}

async function fetchCurrentPlayback(accessToken, market = process.env.SPOTIFY_MARKET || 'GB') {
  return userSpotifyFetch(accessToken, '/me/player/currently-playing', { query: { market } });
}

async function fetchRecentPlays(accessToken, limit = 10) {
  return userSpotifyFetch(accessToken, '/me/player/recently-played', { query: { limit } });
}

async function fetchTopItems(accessToken, type = 'tracks', timeRange = 'medium_term', limit = 10) {
  const normalizedType = type === 'artists' ? 'artists' : 'tracks';
  return userSpotifyFetch(accessToken, `/me/top/${normalizedType}`, {
    query: {
      limit,
      time_range: timeRange
    }
  });
}

async function fetchPlaylists(accessToken, limit = 10) {
  return userSpotifyFetch(accessToken, '/me/playlists', { query: { limit } });
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
  spotifyRedirectUri,
  spotifyScopes,
  buildAuthorizeUrl,
  exchangeAuthorizationCode,
  refreshUserAccessToken,
  fetchUserProfile,
  fetchCurrentPlayback,
  fetchRecentPlays,
  fetchTopItems,
  fetchPlaylists,
  parseSpotifyInput,
  getEntity,
  search,
  userSpotifyFetch
};
