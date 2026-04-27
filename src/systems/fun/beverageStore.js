const db = require('../../services/database');

const SIP_COOLDOWN_MS = 5 * 60 * 1000;

function defaultState() {
  return {
    tea: { total: 0, lastAt: 0 },
    coffee: { total: 0, lastAt: 0 }
  };
}

async function getBeverageState(userId) {
  return db.getKv('fun:beverages', userId, defaultState());
}

async function saveBeverageState(userId, state) {
  return db.setKv('fun:beverages', userId, state);
}

async function sip(userId, type) {
  const state = await getBeverageState(userId);
  state[type] ||= { total: 0, lastAt: 0 };

  const elapsed = Date.now() - Number(state[type].lastAt || 0);
  if (elapsed < SIP_COOLDOWN_MS) {
    return {
      ok: false,
      retryAfterMs: SIP_COOLDOWN_MS - elapsed,
      total: Number(state[type].total || 0)
    };
  }

  state[type].total = Number(state[type].total || 0) + 1;
  state[type].lastAt = Date.now();
  await saveBeverageState(userId, state);

  return {
    ok: true,
    total: state[type].total
  };
}

module.exports = {
  SIP_COOLDOWN_MS,
  getBeverageState,
  sip
};
