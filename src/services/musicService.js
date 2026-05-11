const nodePlayer = require('../systems/music/nodePlayer');
const logger = require('../systems/logging/logger');

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();

  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;

  return fallback;
}

function workerUrl() {
  return String(process.env.MUSIC_WORKER_URL || '').replace(/\/+$/, '');
}

function workerSecret() {
  return String(process.env.MUSIC_WORKER_SECRET || '');
}

function useWorker() {
  const backend = String(process.env.MUSIC_BACKEND || '').trim().toLowerCase();

  if (backend === 'worker' || backend === 'remote') return true;
  if (workerUrl() && workerSecret() && envFlag('MUSIC_WORKER_ENABLED', false)) return true;

  return false;
}

async function callWorker(command, guildId, options = {}) {
  const url = workerUrl();
  const secret = workerSecret();

  if (!url || !secret) {
    return {
      ok: false,
      code: 'music_worker_not_configured',
      replyType: 'bad',
      error: 'Music worker is not configured.',
      description: 'Set MUSIC_WORKER_URL and MUSIC_WORKER_SECRET.'
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
  }).catch((error) => {
    throw new Error(`Music worker unreachable: ${error.message}`);
  });

  const text = await response.text();
  let data;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {
      ok: false,
      error: text || 'Invalid response from music worker.'
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      code: data.code || 'music_worker_error',
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
      return await callWorker(command, guildId, options);
    } catch (error) {
      logger.warn({ error, guildId, command }, 'Remote music worker command failed');

      return {
        ok: false,
        code: 'music_worker_unreachable',
        replyType: 'bad',
        error: 'Music worker is unreachable.',
        description: error.message || 'The remote music worker did not respond.'
      };
    }
  }

  return nodePlayer.runCommand(guildId, command, options);
}

async function health() {
  if (useWorker()) {
    try {
      const response = await fetch(`${workerUrl()}/health`, {
        headers: {
          authorization: `Bearer ${workerSecret()}`
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
    logger.info('Music backend is remote worker; local node player will not start.');
    return null;
  }

  return nodePlayer.initializeMusicPlayer(client);
}

function isNodeMusicEnabled() {
  if (useWorker()) return false;
  return nodePlayer.isNodeMusicEnabled();
}

module.exports = {
  health,
  initializeMusicPlayer,
  isNodeMusicEnabled,
  runCommand
};