const db = require('../../services/database');
const logger = require('../logging/logger');

const ROLE_NAMESPACE = 'premium:server-roles';

function defaultConfig() {
  return {
    joinRoles: [],
    roleConnections: {}
  };
}

async function getRoleAutomationConfig(guildId) {
  const config = await db.getKv(ROLE_NAMESPACE, guildId, defaultConfig());
  return {
    joinRoles: Array.isArray(config.joinRoles) ? [...new Set(config.joinRoles.map(String))] : [],
    roleConnections: normalizeConnections(config.roleConnections || {})
  };
}

function normalizeConnections(input = {}) {
  const output = {};
  for (const [parentRoleId, childRoles] of Object.entries(input || {})) {
    const parentId = String(parentRoleId || '').trim();
    if (!parentId) continue;
    output[parentId] = [...new Set((childRoles || []).map(String).filter(Boolean))];
  }
  return output;
}

async function saveRoleAutomationConfig(guildId, config) {
  const normalized = {
    joinRoles: Array.isArray(config.joinRoles) ? [...new Set(config.joinRoles.map(String))] : [],
    roleConnections: normalizeConnections(config.roleConnections || {})
  };
  await db.setKv(ROLE_NAMESPACE, guildId, normalized);
  return normalized;
}

async function updateRoleAutomationConfig(guildId, updater) {
  const current = await getRoleAutomationConfig(guildId);
  const next = (await updater(current)) || current;
  return saveRoleAutomationConfig(guildId, next);
}

async function applyJoinRoles(member) {
  const config = await getRoleAutomationConfig(member.guild.id);
  if (!config.joinRoles.length) return { ok: true, count: 0 };

  let count = 0;
  for (const roleId of config.joinRoles) {
    const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId).catch(() => null);
    if (!role) continue;
    await member.roles.add(role, 'Premium join-role automation').then(() => {
      count += 1;
    }).catch(() => null);
  }

  return { ok: true, count };
}

async function syncRoleConnections(oldMember, newMember) {
  const config = await getRoleAutomationConfig(newMember.guild.id);
  const parents = Object.keys(config.roleConnections);
  if (!parents.length) return { ok: true, changed: 0 };

  const touchedChildren = new Set();
  const desiredChildren = new Set();

  for (const parentId of parents) {
    const children = config.roleConnections[parentId] || [];
    for (const childId of children) touchedChildren.add(childId);
    if (newMember.roles.cache.has(parentId)) {
      for (const childId of children) desiredChildren.add(childId);
    }
  }

  let changed = 0;
  for (const childId of touchedChildren) {
    const hasRole = newMember.roles.cache.has(childId);
    const shouldHaveRole = desiredChildren.has(childId);

    if (shouldHaveRole && !hasRole) {
      await newMember.roles.add(childId, 'Premium role-connection automation').then(() => {
        changed += 1;
      }).catch(() => null);
      continue;
    }

    if (!shouldHaveRole && hasRole) {
      const wasConnectedBefore = oldMember.roles.cache.has(childId);
      if (!wasConnectedBefore) {
        await newMember.roles.remove(childId, 'Premium role-connection automation').then(() => {
          changed += 1;
        }).catch(() => null);
      }
    }
  }

  return { ok: true, changed };
}

function startRoleAutomationLog(message) {
  logger.debug?.(message);
}

module.exports = {
  defaultConfig,
  getRoleAutomationConfig,
  saveRoleAutomationConfig,
  updateRoleAutomationConfig,
  applyJoinRoles,
  syncRoleConnections,
  startRoleAutomationLog
};
