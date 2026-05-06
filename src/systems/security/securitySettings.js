const db = require('../../services/database');

const NAMESPACE = 'security:config';

const DEFAULT_SECURITY_CONFIG = {
  enabled: false,
  antinuke: false,
  antiraid: false,
  automod: false,
  verification: false,
  logging: false,
  updatedAt: null,
  updatedBy: null
};

async function getSecuritySettings(guildId) {
  const stored = await db.getKv(NAMESPACE, guildId, null).catch(() => null);
  return {
    ...DEFAULT_SECURITY_CONFIG,
    ...(stored || {})
  };
}

async function updateSecuritySettings(guildId, patch = {}) {
  const current = await getSecuritySettings(guildId);

  const next = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString()
  };

  await db.setKv(NAMESPACE, guildId, next);
  return next;
}

async function setSecurityFlag(guildId, key, value, updatedBy = null) {
  return updateSecuritySettings(guildId, {
    [key]: Boolean(value),
    updatedBy
  });
}

module.exports = {
  DEFAULT_SECURITY_CONFIG,
  getSecuritySettings,
  updateSecuritySettings,
  setSecurityFlag
};