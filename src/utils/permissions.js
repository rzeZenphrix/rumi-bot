const { PermissionFlagsBits } = require('discord.js');
const { DANGEROUS_PERMISSIONS } = require('./constants');

function canManageMember(guild, member) {
  if (!guild?.members?.me || !member) return false;
  if (member.id === guild.ownerId) return false;

  return member.manageable;
}

function canModerateMember(guild, member) {
  if (!guild?.members?.me || !member) return false;
  if (member.id === guild.ownerId) return false;

  return member.moderatable;
}

function hasAnyDangerousPermission(role) {
  return DANGEROUS_PERMISSIONS.some((permissionName) => {
    const bit = PermissionFlagsBits[permissionName];
    return bit ? role.permissions.has(bit) : false;
  });
}

function isStaffLike(member) {
  if (!member?.permissions) return false;

  return (
    member.permissions.has(PermissionFlagsBits.Administrator) ||
    member.permissions.has(PermissionFlagsBits.ManageGuild) ||
    member.permissions.has(PermissionFlagsBits.ManageRoles) ||
    member.permissions.has(PermissionFlagsBits.ManageChannels) ||
    member.permissions.has(PermissionFlagsBits.BanMembers) ||
    member.permissions.has(PermissionFlagsBits.KickMembers)
  );
}

module.exports = {
  canManageMember,
  canModerateMember,
  hasAnyDangerousPermission,
  isStaffLike
};