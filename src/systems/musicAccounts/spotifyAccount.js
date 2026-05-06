const spotifyClient = require('../../services/spotify/client');
const store = require('./store');

function nowMs() {
  return Date.now();
}

function normalizeTimeRange(value = '') {
  const input = String(value || '').trim().toLowerCase();
  if (['short', 'short_term', '4week', '1month'].includes(input)) return 'short_term';
  if (['long', 'long_term', '12month', 'year'].includes(input)) return 'long_term';
  return 'medium_term';
}

function timeRangeLabel(value = '') {
  const normalized = normalizeTimeRange(value);
  if (normalized === 'short_term') return 'last 4 weeks';
  if (normalized === 'long_term') return 'all year';
  return 'last 6 months';
}

function tokenExpiresSoon(account = {}) {
  const raw = account.token_expires_at || account.expires_at;
  const timestamp = raw ? new Date(raw).getTime() : 0;
  return !timestamp || timestamp <= nowMs() + 60_000;
}

async function getAccount(discordUserId) {
  return store.getSpotifyAccount(discordUserId);
}

async function refreshAccount(account) {
  const refreshed = await spotifyClient.refreshUserAccessToken(account.refresh_token);
  const saved = await store.saveSpotifyAccount(account.discord_user_id, {
    ...account,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token || account.refresh_token,
    scope: refreshed.scope || account.scope || null,
    token_expires_at: new Date(Date.now() + (Number(refreshed.expires_in || 3600) * 1000)).toISOString(),
    refreshed_at: new Date().toISOString()
  });
  return saved;
}

async function getFreshAccount(discordUserId) {
  const account = await getAccount(discordUserId);
  if (!account) return null;
  if (!tokenExpiresSoon(account)) return account;
  return refreshAccount(account);
}

async function withFreshToken(discordUserId, worker) {
  let account = await getFreshAccount(discordUserId);
  if (!account) {
    const error = new Error('Spotify is not linked for this Discord account.');
    error.code = 'SPOTIFY_NOT_LINKED';
    throw error;
  }

  try {
    return await worker(account.access_token, account);
  } catch (error) {
    if (error?.code === 'SPOTIFY_API_FAILED' && Number(error?.status) === 401 && account.refresh_token) {
      account = await refreshAccount(account);
      return worker(account.access_token, account);
    }
    throw error;
  }
}

async function getProfile(discordUserId) {
  return withFreshToken(discordUserId, (token) => spotifyClient.fetchUserProfile(token));
}

async function getCurrentPlayback(discordUserId) {
  return withFreshToken(discordUserId, (token) => spotifyClient.fetchCurrentPlayback(token));
}

async function getRecent(discordUserId, limit = 10) {
  return withFreshToken(discordUserId, (token) => spotifyClient.fetchRecentPlays(token, limit));
}

async function getTopTracks(discordUserId, timeRange = 'medium_term', limit = 10) {
  return withFreshToken(discordUserId, (token) => spotifyClient.fetchTopItems(token, 'tracks', normalizeTimeRange(timeRange), limit));
}

async function getTopArtists(discordUserId, timeRange = 'medium_term', limit = 10) {
  return withFreshToken(discordUserId, (token) => spotifyClient.fetchTopItems(token, 'artists', normalizeTimeRange(timeRange), limit));
}

async function getPlaylists(discordUserId, limit = 10) {
  return withFreshToken(discordUserId, (token) => spotifyClient.fetchPlaylists(token, limit));
}

module.exports = {
  normalizeTimeRange,
  timeRangeLabel,
  getAccount,
  getFreshAccount,
  getProfile,
  getCurrentPlayback,
  getRecent,
  getTopTracks,
  getTopArtists,
  getPlaylists
};
