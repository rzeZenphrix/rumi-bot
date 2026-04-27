const DEFAULT_URL = 'http://127.0.0.1:3025';

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
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      ...headers(),
      ...(options.headers || {})
    }
  }).catch(() => null);

  if (!response) return null;
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return payload || { ok: false, error: `Music service returned ${response.status}.` };
  }
  return payload;
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
  getState,
  runCommand,
  linkSpotify,
  unlinkSpotify
};
