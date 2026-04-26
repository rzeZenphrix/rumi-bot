const db = require('../../services/database');
const logger = require('../logging/logger');

function permissionKey(permission) {
  if (!permission) return '';
  return permission.toString();
}

async function hasFakePermission(guildId, member, permission) {
  try {
    return await db.hasFakePermission(guildId, member, permissionKey(permission));
  } catch (error) {
    logger.error({ error, guildId, userId: member?.id, permission: permissionKey(permission) }, 'Fake permission lookup failed');
    return false;
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
  hasFakePermission,
  memberHasPermission,
  memberHasAllPermissions
};
