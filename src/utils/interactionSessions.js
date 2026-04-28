const crypto = require('node:crypto');

const sessions = new Map();

function key(prefix, id) {
  return `${prefix}:${id}`;
}

function createSession(prefix, data = {}, ttlMs = 15 * 60 * 1000) {
  const id = crypto.randomBytes(6).toString('hex');
  sessions.set(key(prefix, id), {
    ...data,
    id,
    prefix,
    ttlMs,
    createdAt: Date.now(),
    updatedAt: Date.now()
  });
  return id;
}

function getSession(prefix, id) {
  const entry = sessions.get(key(prefix, id));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > entry.ttlMs) {
    sessions.delete(key(prefix, id));
    return null;
  }
  return entry;
}

function updateSession(prefix, id, patch = {}) {
  const existing = getSession(prefix, id);
  if (!existing) return null;
  const next = {
    ...existing,
    ...patch,
    updatedAt: Date.now()
  };
  sessions.set(key(prefix, id), next);
  return next;
}

function deleteSession(prefix, id) {
  sessions.delete(key(prefix, id));
}

module.exports = {
  createSession,
  getSession,
  updateSession,
  deleteSession
};
