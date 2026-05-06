const logger = require('../logging/logger');

function getValue(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

function isProduction() {
  return String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
}

function looksLocalUrl(value) {
  return /https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(String(value || '').trim());
}

function validateRuntimeEnv(context = {}) {
  const warnings = [];
  const errors = [];

  const token = getValue('DISCORD_TOKEN', 'BOT_TOKEN', 'DISCORD_BOT_TOKEN');
  if (!token) {
    errors.push('Missing DISCORD_TOKEN or BOT_TOKEN.');
  }

  const supabaseUrl = getValue('SUPABASE_URL');
  const supabaseKey = getValue('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SERVICE_KEY');
  if (!supabaseUrl || !supabaseKey) {
    warnings.push('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are not fully configured; persistent guild settings, analytics, premium, and sync features will degrade.');
  }

  const dashboardBackend = getValue('RUMI_DASHBOARD_BACKEND_URL', 'DASHBOARD_BACKEND_URL', 'DASHBOARD_URL', 'DASHBOARD_PUBLIC_URL');
  if (!dashboardBackend) {
    warnings.push('Dashboard backend URL is not configured; website status and command sync will not post back to the website.');
  }

  const publicSite = getValue('PUBLIC_SITE_URL', 'DASHBOARD_PUBLIC_URL', 'BOT_WEBSITE');
  const studioUrl = getValue('STUDIO_URL', 'DASHBOARD_FRONTEND_URL', 'DASHBOARD_URL');
  if (!publicSite) {
    warnings.push('PUBLIC_SITE_URL is not configured; public callbacks and website handoff links may be wrong.');
  }
  if (!studioUrl) {
    warnings.push('STUDIO_URL/DASHBOARD_FRONTEND_URL is not configured; dashboard links may fall back incorrectly.');
  }

  const spotifyId = getValue('SPOTIFY_CLIENT_ID');
  const spotifySecret = getValue('SPOTIFY_CLIENT_SECRET');
  const spotifyRedirect = getValue('SPOTIFY_REDIRECT_URI', 'RUMI_SPOTIFY_REDIRECT_URI');
  if ((spotifyId && !spotifySecret) || (!spotifyId && spotifySecret)) {
    warnings.push('Spotify linking is only partially configured; set both SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET.');
  }
  if ((spotifyId || spotifySecret) && !spotifyRedirect) {
    warnings.push('Spotify linking is missing SPOTIFY_REDIRECT_URI.');
  }

  const lastfmKey = getValue('LASTFM_API_KEY', 'LAST_FM_API_KEY');
  const lastfmSecret = getValue('LASTFM_SHARED_SECRET', 'LAST_FM_SHARED_SECRET');
  const lastfmRedirect = getValue('LASTFM_REDIRECT_URI', 'LAST_FM_REDIRECT_URI');
  if ((lastfmKey && !lastfmSecret) || (!lastfmKey && lastfmSecret)) {
    warnings.push('Last.fm linking is only partially configured; set both LASTFM_API_KEY and LASTFM_SHARED_SECRET.');
  }
  if ((lastfmKey || lastfmSecret) && !lastfmRedirect) {
    warnings.push('Last.fm linking is missing LASTFM_REDIRECT_URI.');
  }

  const musicReady = String(process.env.MUSIC_READY || '').trim().toLowerCase() === 'true';
  const musicServiceUrl = getValue('RUMI_MUSIC_SERVICE_URL');
  if (musicReady && !musicServiceUrl) {
    warnings.push('MUSIC_READY is true but RUMI_MUSIC_SERVICE_URL is not configured; music commands will not reach the sidecar.');
  }

  if (isProduction()) {
    for (const [name, value] of [
      ['PUBLIC_SITE_URL', publicSite],
      ['STUDIO_URL', studioUrl],
      ['SPOTIFY_REDIRECT_URI', spotifyRedirect],
      ['LASTFM_REDIRECT_URI', lastfmRedirect],
    ]) {
      if (value && looksLocalUrl(value)) {
        warnings.push(`${name} still points at a local URL in production (${value}).`);
      }
    }
  }

  if (errors.length) {
    logger.fatal({ errors, context }, 'Environment validation failed');
  }

  if (warnings.length) {
    logger.warn({ warnings, context }, 'Environment validation warnings');
  } else {
    logger.info({ context }, 'Environment validation passed');
  }

  return { warnings, errors };
}

module.exports = {
  validateRuntimeEnv
};
