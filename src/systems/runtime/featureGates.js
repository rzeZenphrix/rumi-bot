const DASHBOARD_NOT_READY = 'Dashboard not ready.';
const MUSIC_NOT_READY = 'That feature is not ready yet.';

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();

  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;

  return fallback;
}

function envText(name) {
  return String(process.env[name] ?? '').trim();
}

function isDashboardReady() {
  return envFlag('DASHBOARD_READY', true);
}

function hasRemoteWorkerConfig() {
  return Boolean(
    envText('MUSIC_WORKER_URL') &&
    envText('MUSIC_WORKER_SECRET')
  );
}

function hasSidecarConfig() {
  return Boolean(
    envText('RUMI_MUSIC_SERVICE_URL') ||
    envFlag('MUSIC_SIDECAR_ENABLED', false)
  );
}

function isMusicReady() {
  const backend = envText('MUSIC_BACKEND').toLowerCase();
  const explicit = envText('MUSIC_READY').toLowerCase();

  if (backend === 'off' || backend === 'disabled' || backend === 'none') {
    return false;
  }

  // Important: commands are ready when the remote worker is configured.
  // NODE_MUSIC_ENABLED can stay false on Render because Render is not streaming locally.
  if (backend === 'worker' || backend === 'remote') {
    if (explicit) return envFlag('MUSIC_READY', hasRemoteWorkerConfig());
    return hasRemoteWorkerConfig();
  }

  if (backend === 'sidecar' || backend === 'http') {
    if (explicit) return envFlag('MUSIC_READY', hasSidecarConfig());
    return hasSidecarConfig();
  }

  if (backend === 'node') {
    const nodeExplicit = envText('NODE_MUSIC_ENABLED').toLowerCase();
    if (nodeExplicit) return envFlag('NODE_MUSIC_ENABLED', true);
    if (explicit) return envFlag('MUSIC_READY', true);
    return true;
  }

  // No backend specified: preserve old behavior.
  const nodeExplicit = envText('NODE_MUSIC_ENABLED').toLowerCase();
  if (nodeExplicit) return envFlag('NODE_MUSIC_ENABLED', false);

  if (explicit) return envFlag('MUSIC_READY', false);

  return true;
}

function dashboardNotReadyPayload() {
  return {
    ok: false,
    code: 'DASHBOARD_NOT_READY',
    error: DASHBOARD_NOT_READY,
    description: DASHBOARD_NOT_READY,
    replyType: 'bad'
  };
}

function musicNotReadyPayload() {
  return {
    ok: false,
    code: 'MUSIC_NOT_READY',
    error: MUSIC_NOT_READY,
    description: MUSIC_NOT_READY,
    replyType: 'bad'
  };
}

module.exports = {
  DASHBOARD_NOT_READY,
  MUSIC_NOT_READY,
  isDashboardReady,
  isMusicReady,
  dashboardNotReadyPayload,
  musicNotReadyPayload
};