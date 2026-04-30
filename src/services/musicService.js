const DEFAULT_URL = 'http://127.0.0.1:3025';
const DEFAULT_TIMEOUT_MS = Math.max(2000, Number(process.env.MUSIC_SERVICE_TIMEOUT_MS || 8000));

function baseUrl() {
  return (process.env.RUMI_MUSIC_SERVICE_URL || DEFAULT_URL).replace(/\/+$/, '');
}

function headers() {
  const output = { 'Content-Type': 'application/json' };
  if (process.env.RUMI_SHARED_SECRET) {
    output['x-rumi-shared-secret'] = process.env.RUMI_SHARED_SECRET;
  }
  return output;
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeoutMs = Math.max(1000, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS));
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    signal: controller.signal,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  }).catch((error) => ({ __networkError: error }));

  clearTimeout(timeout);

  if (!response || response.__networkError) {
    const target = baseUrl();
    return {
      ok: false,
      code: 'music_service_unreachable',
      error: 'I could not reach the embedded music service.',
      detail: response?.__networkError?.name === 'AbortError'
        ? `The embedded music service at ${target} did not respond within ${timeoutMs}ms. It may still be booting Java, Lavalink, or the music sidecar.`
        : `The embedded music service at ${target} did not accept the connection.`
    };
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return payload || {
      ok: false,
      code: 'music_service_error',
      error: `Music service returned ${response.status}.`
    };
  }
  return payload;
}

async function health() {
  return request('/health', { method: 'GET', timeoutMs: 5000 });
}

async function getState(guildId) {
  return request(`/api/state?guildId=${encodeURIComponent(guildId)}`);
}

async function runCommand(guildId, command, options = {}) {
  return request('/api/command', {
    method: 'POST',
    body: JSON.stringify({
      guildId,
      command,
      options
    })
  });
}

async function linkSpotify(userId, data = {}) {
  return request('/api/spotify/link', {
    method: 'POST',
    body: JSON.stringify({
      userId,
      ...data
    })
  });
}

async function unlinkSpotify(userId) {
  return request('/api/spotify/unlink', {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
}

module.exports = {
  baseUrl,
  health,
  getState,
  runCommand,
  linkSpotify,
  unlinkSpotify
};
