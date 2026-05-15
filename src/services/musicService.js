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

function selectedBackend() {
  return String(process.env.MUSIC_BACKEND || '').trim().toLowerCase();
}

function useLavalink() {
  const backend = selectedBackend();

  if (backend === 'lavalink') return true;
  if (backend === 'node') return false;

  return envFlag(
    'LAVALINK_ENABLED',
    Boolean(process.env.LAVALINK_URL && process.env.LAVALINK_PASSWORD)
  );
}

function activeBackend() {
  return useLavalink() ? lavalinkPlayer : nodePlayer;
}

function backendName() {
  return useLavalink() ? 'lavalink' : 'node';
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

async function runCommand(guildId, command, options = {}) {
  try {
    return await activeBackend().runCommand(guildId, command, options);
  } catch (error) {
    logger.warn(
      {
        error,
        guildId,
        command,
        backend: backendName()
      },
      'Music command failed'
    );

    return errorPayload(error, 'music_command_failed');
  }
}

async function getState(guildId, options = {}) {
  return runCommand(guildId, 'status', options);
}

async function health() {
  try {
    return await activeBackend().health();
  } catch (error) {
    return {
      ok: false,
      backend: backendName(),
      error: error.message
    };
  }
}

async function initializeMusicPlayer(client) {
  try {
    const backend = activeBackend();
    const player = await backend.initializeMusicPlayer(client);

    logger.info(
      {
        backend: backendName()
      },
      'Music backend initialized'
    );

    return player;
  } catch (error) {
    logger.warn(
      {
        error,
        backend: backendName()
      },
      'Music backend failed to initialize; commands will retry on demand'
    );

    return null;
  }
}

function isLavalinkEnabled() {
  return useLavalink();
}

function isNodeMusicEnabled() {
  if (useLavalink()) return true;

  return nodePlayer.isNodeMusicEnabled();
}

function isMusicEnabled() {
  return isNodeMusicEnabled();
}

function isWorkerEnabled() {
  return false;
}

async function handleMusicInteraction(interaction) {
  const backend = activeBackend();

  if (typeof backend.handleMusicInteraction !== 'function') {
    return false;
  }

  return backend.handleMusicInteraction(interaction);
}

module.exports = {
  getState,
  handleMusicInteraction,
  health,
  initializeMusicPlayer,
  isLavalinkEnabled,
  isNodeMusicEnabled,
  isMusicEnabled,
  isWorkerEnabled,
  runCommand
};