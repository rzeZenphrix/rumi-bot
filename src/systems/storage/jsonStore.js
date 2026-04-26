const cache = new Map();
const loading = new Set();
function clone(value) { try { return JSON.parse(JSON.stringify(value)); } catch { return value; } }
function getDb() { try { return require('../../services/database'); } catch { return null; } }
function readStore(name, fallback = {}) {
  if (!cache.has(name)) {
    cache.set(name, clone(fallback));
    if (!loading.has(name)) {
      loading.add(name);
      const db = getDb();
      if (db?.getKv) {
        db.getKv('jsonStore', name, null)
          .then((value) => { if (value && typeof value === 'object') cache.set(name, value); })
          .catch(() => null)
          .finally(() => loading.delete(name));
      } else loading.delete(name);
    }
  }
  return cache.get(name);
}
function writeStore(name, value) {
  cache.set(name, value);
  const db = getDb();
  if (db?.setKv) db.setKv('jsonStore', name, value).catch(() => null);
  return value;
}
async function readStoreAsync(name, fallback = {}) {
  const db = getDb();
  if (db?.getKv) {
    const value = await db.getKv('jsonStore', name, null).catch(() => null);
    if (value && typeof value === 'object') { cache.set(name, value); return value; }
  }
  return readStore(name, fallback);
}
async function writeStoreAsync(name, value) {
  cache.set(name, value);
  const db = getDb();
  if (db?.setKv) await db.setKv('jsonStore', name, value).catch(() => null);
  return value;
}
module.exports = { readStore, writeStore, readStoreAsync, writeStoreAsync };
