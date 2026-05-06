const db = require('../../services/database');
const logger = require('../logging/logger');

const STAFF_FAKE_PERMISSIONS = Object.freeze([
  'RumiStaff',
  'RumiModerator',
  'RumiAdmin',

  'RumiManageMessages',
  'RumiModerateMembers',
  'RumiManageRoles',
  'RumiManageChannels',
  'RumiManageTickets',

  'RumiBypassAutomod',
  'RumiBypassAntiraid',
  'RumiBypassAntinuke',
  'RumiBypass',

  'RumiUseModCommands',
  'RumiUseSecurityCommands',
  'RumiUseTicketCommands',
  'RumiUseConfigCommands'
]);

function normalizePermission(value = '') {
  return String(value || '').trim();
}

function normalizePermissionList(list = []) {
  return [...new Set(
    (Array.isArray(list) ? list : [list])
      .map(normalizePermission)
      .filter(Boolean)
  )];
}

function isKnownStaffFakePermission(permission) {
  return STAFF_FAKE_PERMISSIONS.includes(normalizePermission(permission));
}

function resolveRoleFromMember(member, roleId) {
  if (!member?.guild || !roleId) return null;
  return member.guild.roles.cache.get(roleId) || null;
}

async function setRoleFakePermissions(guildId, roleId, permissions = [], grantedBy = null) {
  const clean = normalizePermissionList(permissions);

  const rows = [];

  for (const permission of clean) {
    rows.push(await db.upsertFakePermission({
      guild_id: guildId,
      subject_type: 'role',
      subject_id: roleId,
      permission,
      enabled: true,
      granted_by: grantedBy
    }));
  }

  return rows;
}

async function removeRoleFakePermissions(guildId, roleId, permissions = []) {
  const clean = normalizePermissionList(permissions);
  const removed = [];

  for (const permission of clean) {
    const result = await db.removeFakePermission(guildId, 'role', roleId, permission);
    removed.push(...(result || []));
  }

  return removed;
}

async function clearRoleFakePermissions(guildId, roleId) {
  return db.clearRoleFakePermissions(guildId, roleId);
}

async function addStaffRole(options) {
  const {
    guildId,
    roleId,
    label = null,
    stripOnStaffStrip = true,
    protectedFromStaffStrip = false,
    fakePermissions = [],
    addedBy = null,
    metadata = {}
  } = options;

  const row = await db.upsertStaffRole({
    guild_id: guildId,
    role_id: roleId,
    label,
    strip_on_staff_strip: stripOnStaffStrip !== false,
    protected_from_staff_strip: protectedFromStaffStrip === true,
    added_by: addedBy,
    metadata
  });

  if (fakePermissions.length) {
    await setRoleFakePermissions(guildId, roleId, fakePermissions, addedBy);
  }

  return row;
}

async function removeStaffRole(options) {
  const {
    guildId,
    roleId,
    clearFakePermissions: shouldClearFakePermissions = false
  } = options;

  if (shouldClearFakePermissions) {
    await clearRoleFakePermissions(guildId, roleId).catch((error) => {
      logger.warn({ error, guildId, roleId }, 'Could not clear staff role fake permissions');
    });
  }

  return db.removeStaffRole(guildId, roleId);
}

async function listStaffRoles(guildId) {
  return db.listStaffRoles(guildId);
}

async function getMemberStaffRoleRows(guildId, member) {
  const configured = await listStaffRoles(guildId).catch(() => []);
  const memberRoleIds = new Set(member?.roles?.cache?.keys?.() || []);

  return configured.filter((row) => memberRoleIds.has(row.role_id));
}

async function memberHasStaffRole(guildId, member) {
  const rows = await getMemberStaffRoleRows(guildId, member);
  return rows.length > 0;
}

async function staffStripMember(member, options = {}) {
  const {
    reason = 'Staff strip',
    includeProtected = false
  } = options;

  if (!member?.guild) {
    return {
      ok: false,
      removed: [],
      failed: [],
      skipped: [],
      reason: 'Member or guild could not be resolved.'
    };
  }

  const staffRows = await getMemberStaffRoleRows(member.guild.id, member);
  const removed = [];
  const failed = [];
  const skipped = [];

  for (const row of staffRows) {
    const role = resolveRoleFromMember(member, row.role_id);

    if (!role) {
      skipped.push({
        roleId: row.role_id,
        reason: 'Role no longer exists.'
      });
      continue;
    }

    if (!row.strip_on_staff_strip) {
      skipped.push({
        roleId: role.id,
        roleName: role.name,
        reason: 'Role is not marked for staff-strip.'
      });
      continue;
    }

    if (row.protected_from_staff_strip && !includeProtected) {
      skipped.push({
        roleId: role.id,
        roleName: role.name,
        reason: 'Role is protected from staff-strip.'
      });
      continue;
    }

    if (role.managed) {
      skipped.push({
        roleId: role.id,
        roleName: role.name,
        reason: 'Managed role cannot be removed.'
      });
      continue;
    }

    if (!role.editable) {
      failed.push({
        roleId: role.id,
        roleName: role.name,
        reason: 'Rumi cannot manage this role due to hierarchy or permissions.'
      });
      continue;
    }

    try {
      await member.roles.remove(role, reason);
      removed.push({
        roleId: role.id,
        roleName: role.name
      });
    } catch (error) {
      failed.push({
        roleId: role.id,
        roleName: role.name,
        reason: error.message
      });
    }
  }

  return {
    ok: failed.length === 0,
    removed,
    failed,
    skipped
  };
}

module.exports = {
  STAFF_FAKE_PERMISSIONS,
  normalizePermission,
  normalizePermissionList,
  isKnownStaffFakePermission,
  setRoleFakePermissions,
  removeRoleFakePermissions,
  clearRoleFakePermissions,
  addStaffRole,
  removeStaffRole,
  listStaffRoles,
  getMemberStaffRoleRows,
  memberHasStaffRole,
  staffStripMember
};