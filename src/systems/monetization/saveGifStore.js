const db = require('../../services/database');

const SAVEGIF_NAMESPACE = 'premium:savegif';

function normalizeName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

async function getGallery(userId) {
  const gallery = await db.getKv(SAVEGIF_NAMESPACE, userId, { items: [] });
  return {
    items: Array.isArray(gallery.items) ? gallery.items.filter(Boolean) : []
  };
}

async function saveGallery(userId, gallery) {
  return db.setKv(SAVEGIF_NAMESPACE, userId, {
    items: Array.isArray(gallery.items) ? gallery.items.filter(Boolean) : []
  });
}

async function upsertSavedGif(userId, entry) {
  const key = normalizeName(entry.name);
  if (!key) return null;

  const gallery = await getGallery(userId);
  const existingIndex = gallery.items.findIndex((item) => item.key === key);
  const nextEntry = {
    key,
    name: String(entry.name || key).trim().slice(0, 64),
    sourceUrl: entry.sourceUrl,
    resolvedUrl: entry.resolvedUrl || null,
    contentType: entry.contentType || null,
    originalName: entry.originalName || `${key}.gif`,
    createdAt: entry.createdAt || new Date().toISOString()
  };

  if (existingIndex >= 0) {
    gallery.items[existingIndex] = nextEntry;
  } else {
    gallery.items.push(nextEntry);
  }

  await saveGallery(userId, gallery);
  return nextEntry;
}

async function removeSavedGif(userId, name) {
  const key = normalizeName(name);
  const gallery = await getGallery(userId);
  const index = gallery.items.findIndex((item) => item.key === key);
  if (index < 0) return null;
  const [removed] = gallery.items.splice(index, 1);
  await saveGallery(userId, gallery);
  return removed;
}

async function findSavedGif(userId, name) {
  const key = normalizeName(name);
  const gallery = await getGallery(userId);
  return gallery.items.find((item) => item.key === key) || null;
}

module.exports = {
  normalizeName,
  getGallery,
  upsertSavedGif,
  removeSavedGif,
  findSavedGif
};
