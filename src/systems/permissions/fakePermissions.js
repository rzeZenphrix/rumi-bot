const db = require('../../services/database');
const logger = require('../logging/logger');
const warningWindow = new Map();
const WARNING_TTL_MS = Math.max(5000, Number(process.env.FAKE_PERMISSION_WARN_TTL_MS || 30000));

function permissionKey(permission) {
  if (!permission) return '';
  return permission.toString();
}

async function hasFakePermission(guildId, member, permission) {
  try {
    return await db.hasFakePermission(guildId, member, permissionKey(permission));
  } catch (error) {
    const key = `${guildId}:${permissionKey(permission)}`;
    const now = Date.now();
    const last = warningWindow.get(key) || 0;
    if (now - last >= WARNING_TTL_MS) {
      warningWindow.set(key, now);
      logger.warn({ error, guildId, userId: member?.id, permission: permissionKey(permission) }, 'Fake permission lookup failed');
    }
    return false;
  }
}

async function probeFakePermission(guildId, member, permission) {
  try {
    return {
      ok: true,
      value: await db.hasFakePermission(guildId, member, permissionKey(permission))
    };
  } catch (error) {
    const key = `${guildId}:${permissionKey(permission)}:probe`;
    const now = Date.now();
    const last = warningWindow.get(key) || 0;
    if (now - last >= WARNING_TTL_MS) {
      warningWindow.set(key, now);
      logger.warn({ error, guildId, userId: member?.id, permission: permissionKey(permission) }, 'Fake permission probe failed');
    }
    return { ok: false, value: false };
  }
}

async function memberHasPermission(member, permission) {
  if (!member) return false;
  if (member.permissions?.has(permission)) return true;
  return hasFakePermission(member.guild.id, member, permission);
}

async function memberHasAllPermissions(member, permissions = []) {
  for (const permission of permissions) {
    const allowed = await memberHasPermission(member, permission);
    if (!allowed) return false;
  }

  return true;
}

module.exports = {
  permissionKey,
  probeFakePermission,
  hasFakePermission,
  memberHasPermission,
  memberHasAllPermissions
};
