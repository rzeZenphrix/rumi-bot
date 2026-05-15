const nodePlayer = require('../systems/music/nodePlayer');
const lavalinkPlayer = require('../systems/music/lavalinkPlayer');
const logger = require('../systems/logging/logger');

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();

  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;

  return fallback;
}

function getWorkerUrl() {
  return String(process.env.MUSIC_WORKER_URL || '').replace(/\/+$/, '');
}

function getWorkerSecret() {
  return String(process.env.MUSIC_WORKER_SECRET || '').trim();
}

function selectedBackend() {
  return String(process.env.MUSIC_BACKEND || '').trim().toLowerCase();
}

function useWorker() {
  const backend = selectedBackend();

  if (backend === 'worker' || backend === 'remote') return true;
  if (backend === 'lavalink' || backend === 'node') return false;
  if (getWorkerUrl() && getWorkerSecret() && envFlag('MUSIC_WORKER_ENABLED', false)) return true;

  return false;
}

function useLavalink() {
  const backend = selectedBackend();

  if (backend === 'lavalink') return true;
  if (backend === 'node' || backend === 'worker' || backend === 'remote') return false;

  return envFlag('LAVALINK_ENABLED', Boolean(process.env.LAVALINK_URL && process.env.LAVALINK_PASSWORD));
}

function activeLocalBackend() {
  return useLavalink() ? lavalinkPlayer : nodePlayer;
}

function errorPayload(error, code = 'music_error') {
  const message = error?.message || String(error || 'Unknown music error.');

  return {
    ok: false,
    code,
    replyType: 'bad',
    error: message,
    description: message
  };
}

async function callWorker(guildId, command, options = {}) {
  const url = getWorkerUrl();
  const secret = getWorkerSecret();

  if (!url || !secret) {
    return {
      ok: false,
      code: 'music_worker_not_configured',
      replyType: 'bad',
      error: 'Music worker is not configured.',
      description: 'Set MUSIC_WORKER_URL and MUSIC_WORKER_SECRET on the main bot.'
    };
  }

  const response = await fetch(`${url}/run`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${secret}`
    },
    body: JSON.stringify({
      guildId,
      command,
      options
    })
  });

  const raw = await response.text();
  let data;

  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {
      ok: false,
      error: raw || 'Invalid response from music worker.',
      description: raw || 'Invalid response from music worker.'
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: data.code || 'music_worker_http_error',
      replyType: 'bad',
      error: data.error || `Music worker returned HTTP ${response.status}.`,
      description: data.description || data.error || `Music worker returned HTTP ${response.status}.`
    };
  }

  return data;
}

async function runCommand(guildId, command, options = {}) {
  if (useWorker()) {
    try {
      return await callWorker(guildId, command, options);
    } catch (error) {
      logger.warn({ error, guildId, command }, 'Remote music worker command failed');
      return errorPayload(error, 'music_worker_unreachable');
    }
  }

  const backend = activeLocalBackend();

  try {
    return await backend.runCommand(guildId, command, options);
  } catch (error) {
    logger.warn({ error, guildId, command, backend: useLavalink() ? 'lavalink' : 'node' }, 'Local music command failed');
    return errorPayload(error, 'music_local_error');
  }
}

async function health() {
  if (useWorker()) {
    try {
      const response = await fetch(`${getWorkerUrl()}/health`, {
        headers: {
          authorization: `Bearer ${getWorkerSecret()}`
        }
      });

      return await response.json();
    } catch (error) {
      return {
        ok: false,
        backend: 'worker',
        error: error.message
      };
    }
  }

  return activeLocalBackend().health();
}

async function initializeMusicPlayer(client) {
  if (useWorker()) {
    logger.info(
      {
        url: getWorkerUrl()
      },
      'Music backend is remote worker; local player will not start.'
    );

    return null;
  }

  try {
    return await activeLocalBackend().initializeMusicPlayer(client);
  } catch (error) {
    logger.warn({ error, backend: useLavalink() ? 'lavalink' : 'node' }, 'Music backend failed to initialize; commands will retry on demand');
    return null;
  }
}

function isNodeMusicEnabled() {
  // Music commands should still be available when using the remote worker or Lavalink.
  if (useWorker() || useLavalink()) return true;

  return nodePlayer.isNodeMusicEnabled();
}

function isLavalinkEnabled() {
  return useLavalink();
}

function isMusicEnabled() {
  return isNodeMusicEnabled();
}

function isWorkerEnabled() {
  return useWorker();
}

module.exports = {
  health,
  initializeMusicPlayer,
  isLavalinkEnabled,
  isNodeMusicEnabled,
  isMusicEnabled,
  isWorkerEnabled,
  runCommand
};