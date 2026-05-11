const nodePlayer = require('../systems/music/nodePlayer');
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

function useWorker() {
  const backend = String(process.env.MUSIC_BACKEND || '').trim().toLowerCase();

  if (backend === 'worker' || backend === 'remote') return true;
  if (getWorkerUrl() && getWorkerSecret() && envFlag('MUSIC_WORKER_ENABLED', false)) return true;

  return false;
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

  try {
    return await nodePlayer.runCommand(guildId, command, options);
  } catch (error) {
    logger.warn({ error, guildId, command }, 'Local music command failed');
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

  return nodePlayer.health();
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

  return nodePlayer.initializeMusicPlayer(client);
}

function isNodeMusicEnabled() {
  // Music commands should still be available when using the remote worker.
  if (useWorker()) return true;

  return nodePlayer.isNodeMusicEnabled();
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
  isNodeMusicEnabled,
  isMusicEnabled,
  isWorkerEnabled,
  runCommand
};