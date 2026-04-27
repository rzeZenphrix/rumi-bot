const DEFAULT_COOLDOWN_MS = Number(process.env.DB_CIRCUIT_COOLDOWN_MS || 60000);
const DEFAULT_FAILURE_LIMIT = Number(process.env.DB_CIRCUIT_FAILURE_LIMIT || 3);

let failures = 0;
let disabledUntil = 0;
let lastError = null;

function isOpen() {
  return Date.now() < disabledUntil;
}

function recordSuccess() {
  failures = 0;
  disabledUntil = 0;
  lastError = null;
}

function recordFailure(error) {
  failures += 1;
  lastError = error;

  if (failures >= DEFAULT_FAILURE_LIMIT) {
    disabledUntil = Date.now() + DEFAULT_COOLDOWN_MS;
  }
}

function getState() {
  return {
    open: isOpen(),
    failures,
    disabledUntil,
    retryInMs: Math.max(0, disabledUntil - Date.now()),
    lastError: lastError ? String(lastError.message || lastError.code || lastError) : null
  };
}

module.exports = {
  isOpen,
  recordSuccess,
  recordFailure,
  getState
};
