const db = require('../../services/database');

const NAMESPACE = 'roles:options';

function normalizeOptionName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

function defaultStore() {
  return { options: {}, updatedAt: null };
}

async function getRoleOptions(guildId) {
  const stored = await db.getKv(NAMESPACE, guildId, defaultStore());
  return {
    ...defaultStore(),
    ...(stored || {}),
    options: stored?.options || {}
  };
}

async function saveRoleOptions(guildId, store) {
  return db.setKv(NAMESPACE, guildId, {
    ...defaultStore(),
    ...(store || {}),
    updatedAt: new Date().toISOString()
  });
}

async function upsertRoleOption(guildId, name, role, metadata = {}) {
  const key = normalizeOptionName(name);
  if (!key) throw new Error('INVALID_ROLE_OPTION_NAME');

  const store = await getRoleOptions(guildId);
  store.options[key] = {
    name: key,
    roleId: role.id,
    roleName: role.name,
    connectedAt: new Date().toISOString(),
    ...metadata
  };

  await saveRoleOptions(guildId, store);
  return store.options[key];
}

async function deleteRoleOption(guildId, name) {
  const key = normalizeOptionName(name);
  const store = await getRoleOptions(guildId);
  const existing = store.options[key] || null;
  delete store.options[key];
  await saveRoleOptions(guildId, store);
  return existing;
}

async function listRoleOptions(guildId) {
  const store = await getRoleOptions(guildId);
  return Object.values(store.options || {}).sort((a, b) => a.name.localeCompare(b.name));
}

module.exports = {
  normalizeOptionName,
  getRoleOptions,
  upsertRoleOption,
  deleteRoleOption,
  listRoleOptions
};
