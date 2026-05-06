const API_BASE = 'https://ws.audioscrobbler.com/2.0/';
const AUTH_BASE = 'https://www.last.fm/api/auth/';

function getApiKey() {
  return process.env.LASTFM_API_KEY || process.env.LAST_FM_API_KEY || '';
}

function getSharedSecret() {
  return process.env.LASTFM_SHARED_SECRET || process.env.LAST_FM_SHARED_SECRET || '';
}

function isConfigured() {
  return Boolean(getApiKey());
}

function isAuthConfigured() {
  return Boolean(getApiKey() && getSharedSecret());
}

function lastfmRedirectUri() {
  return (
    process.env.LASTFM_REDIRECT_URI
    || process.env.LAST_FM_REDIRECT_URI
    || `${(process.env.PUBLIC_SITE_URL || process.env.DASHBOARD_PUBLIC_URL || process.env.BOT_WEBSITE || 'https://rumi.rocks').replace(/\/+$/, '')}/auth/lastfm/callback`
  );
}

function imageFrom(images = []) {
  const list = Array.isArray(images) ? images : [];
  return [...list].reverse().find((item) => item?.['#text'])?.['#text'] || null;
}

function normalizeArtist(value) {
  if (!value) return 'Unknown artist';
  if (typeof value === 'string') return value;
  return value.name || value['#text'] || 'Unknown artist';
}

function signature(params = {}) {
  const secret = getSharedSecret();
  if (!secret) {
    const error = new Error('Last.fm shared secret is not configured.');
    error.code = 'LASTFM_SECRET_MISSING';
    throw error;
  }

  const raw = Object.keys(params)
    .filter((key) => key !== 'format' && params[key] !== undefined && params[key] !== null && params[key] !== '')
    .sort()
    .map((key) => `${key}${params[key]}`)
    .join('');

  return require('node:crypto').createHash('md5').update(`${raw}${secret}`, 'utf8').digest('hex');
}

async function request(method, params = {}) {
  const key = getApiKey();

  if (!key) {
    const error = new Error('Last.fm API key is not configured.');
    error.code = 'LASTFM_NOT_CONFIGURED';
    throw error;
  }

  const url = new URL(API_BASE);
  url.searchParams.set('method', method);
  url.searchParams.set('api_key', key);
  url.searchParams.set('format', 'json');

  for (const [name, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(name, String(value));
    }
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RumiBot/1.0 LastFM'
    }
  }).catch(() => null);

  if (!response) {
    const error = new Error('Last.fm request failed.');
    error.code = 'LASTFM_NETWORK_FAILED';
    throw error;
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok || payload?.error) {
    const error = new Error(payload?.message || `Last.fm returned HTTP ${response.status}.`);
    error.code = 'LASTFM_API_FAILED';
    error.status = response.status;
    error.lastfmCode = payload?.error;
    throw error;
  }

  return payload;
}

function buildAuthorizeUrl(state, options = {}) {
  if (!isAuthConfigured()) {
    const error = new Error('Last.fm auth credentials are not configured.');
    error.code = 'LASTFM_NOT_CONFIGURED';
    throw error;
  }

  const callback = new URL(String(options.redirectUri || lastfmRedirectUri()));
  if (state) callback.searchParams.set('state', String(state));

  const url = new URL(AUTH_BASE);
  url.searchParams.set('api_key', getApiKey());
  url.searchParams.set('cb', callback.toString());
  return url.toString();
}

async function exchangeTokenForSession(token) {
  const params = {
    method: 'auth.getSession',
    api_key: getApiKey(),
    token: String(token || '')
  };

  const url = new URL(API_BASE);
  url.searchParams.set('method', 'auth.getSession');
  url.searchParams.set('api_key', getApiKey());
  url.searchParams.set('token', String(token || ''));
  url.searchParams.set('api_sig', signature(params));
  url.searchParams.set('format', 'json');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'RumiBot/1.0 LastFM'
    }
  }).catch(() => null);

  if (!response) {
    const error = new Error('Last.fm session exchange failed.');
    error.code = 'LASTFM_NETWORK_FAILED';
    throw error;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.error) {
    const error = new Error(payload?.message || `Last.fm returned HTTP ${response.status}.`);
    error.code = 'LASTFM_AUTH_FAILED';
    error.status = response.status;
    error.lastfmCode = payload?.error;
    throw error;
  }

  return payload?.session || {};
}

async function getUserInfo(username) {
  return request('user.getInfo', { user: username });
}

async function getRecentTracks(username, limit = 5) {
  const payload = await request('user.getRecentTracks', { user: username, limit });
  const tracks = payload?.recenttracks?.track || [];

  return (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean).map((track) => ({
    name: track.name || 'Unknown track',
    artist: normalizeArtist(track.artist),
    album: track.album?.['#text'] || '',
    url: track.url || '',
    image: imageFrom(track.image),
    nowPlaying: track['@attr']?.nowplaying === 'true',
    playedAt: track.date?.uts ? Number(track.date.uts) : null
  }));
}

async function getTop(username, period = '7day', type = 'artists', limit = 10) {
  const methodMap = {
    artists: 'user.getTopArtists',
    albums: 'user.getTopAlbums',
    tracks: 'user.getTopTracks'
  };

  const method = methodMap[type] || methodMap.artists;
  const payload = await request(method, { user: username, period, limit });
  const key = type === 'artists' ? 'artist' : type === 'albums' ? 'album' : 'track';
  const bucket = type === 'artists' ? 'topartists' : type === 'albums' ? 'topalbums' : 'toptracks';
  const items = payload?.[bucket]?.[key] || [];

  return (Array.isArray(items) ? items : [items]).filter(Boolean).map((item) => ({
    name: item.name || 'Unknown',
    artist: normalizeArtist(item.artist),
    playcount: Number(item.playcount || 0),
    url: item.url || '',
    image: imageFrom(item.image)
  }));
}

async function getLovedTracks(username, limit = 10) {
  const payload = await request('user.getLovedTracks', { user: username, limit });
  const tracks = payload?.lovedtracks?.track || [];

  return (Array.isArray(tracks) ? tracks : [tracks]).filter(Boolean).map((track) => ({
    name: track.name || 'Unknown track',
    artist: normalizeArtist(track.artist),
    album: track.album?.['#text'] || '',
    url: track.url || '',
    image: imageFrom(track.image),
    lovedAt: Number(track.date?.uts || 0) || null
  }));
}

module.exports = {
  isConfigured,
  isAuthConfigured,
  lastfmRedirectUri,
  buildAuthorizeUrl,
  exchangeTokenForSession,
  getUserInfo,
  getRecentTracks,
  getTop,
  getLovedTracks
};
