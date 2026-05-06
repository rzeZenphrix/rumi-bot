const DASHBOARD_NOT_READY = 'Dashboard not ready.';
const MUSIC_NOT_READY = 'That feature is not ready yet.';

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function isDashboardReady() {
  return envFlag('DASHBOARD_READY', true);
}

function isMusicReady() {
  const explicit = String(process.env.MUSIC_READY ?? '').trim().toLowerCase();
  if (explicit) {
    return envFlag('MUSIC_READY', false);
  }

  return Boolean(
    String(process.env.RUMI_MUSIC_SERVICE_URL || '').trim() ||
    envFlag('MUSIC_SIDECAR_ENABLED', false)
  );
}

function dashboardNotReadyPayload() {
  return {
    ok: false,
    code: 'DASHBOARD_NOT_READY',
    error: DASHBOARD_NOT_READY
  };
}

function musicNotReadyPayload() {
  return {
    ok: false,
    code: 'MUSIC_NOT_READY',
    error: MUSIC_NOT_READY
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
