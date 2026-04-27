const logger = require('../logging/logger');

let keepAliveTimer = null;
let lastFailureAt = 0;

function getKeepAliveUrl() {
  const explicit = String(process.env.KEEPALIVE_URL || '').trim();
  if (explicit) return explicit;

  const renderUrl = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
  if (renderUrl) return `${renderUrl}/health`;

  const publicApi = String(process.env.API_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (publicApi) return `${publicApi}/health`;

  return '';
}

function getIntervalMs() {
  return Math.max(60000, Number(process.env.KEEPALIVE_INTERVAL_MS || 240000));
}

async function pingUrl(url) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'cache-control': 'no-store' }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
}

function startKeepAlive() {
  if (keepAliveTimer) return false;

  const url = getKeepAliveUrl();
  if (!url) return false;

  const intervalMs = getIntervalMs();
  const logWindowMs = Math.max(intervalMs, 300000);

  const tick = () => {
    pingUrl(url).catch((error) => {
      const now = Date.now();
      if (now - lastFailureAt < logWindowMs) return;
      lastFailureAt = now;
      logger.warn(
        {
          error,
          url,
          intervalMs
        },
        'Keepalive ping failed'
      );
    });
  };

  keepAliveTimer = setInterval(tick, intervalMs);
  keepAliveTimer.unref?.();
  tick();
  return true;
}

module.exports = {
  startKeepAlive,
  getKeepAliveUrl
};
