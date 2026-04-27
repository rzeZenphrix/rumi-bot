const { PermissionFlagsBits } = require('discord.js');
const { DANGEROUS_PERMISSIONS } = require('./constants');

function manageabilityState(guild, member) {
  const me = guild?.members?.me;
  if (!me || !member) return { ok: false, reason: 'I could not resolve the member or my own server profile.' };
  if (member.id === guild.ownerId) return { ok: false, reason: 'I cannot manage the server owner.' };
  if (member.id === me.id) return { ok: false, reason: 'I cannot target myself.' };
  if (!member.manageable) return { ok: false, reason: 'Their highest role is above mine, or I am missing the required Discord permissions.' };
  return { ok: true, reason: null };
}

function moderatabilityState(guild, member) {
  const me = guild?.members?.me;
  if (!me || !member) return { ok: false, reason: 'I could not resolve the member or my own server profile.' };
  if (member.id === guild.ownerId) return { ok: false, reason: 'I cannot moderate the server owner.' };
  if (member.id === me.id) return { ok: false, reason: 'I cannot target myself.' };
  if (!member.moderatable) return { ok: false, reason: 'Their highest role is above mine, or I am missing Moderate Members.' };
  return { ok: true, reason: null };
}

function canManageMember(guild, member) {
  return manageabilityState(guild, member).ok;
}

function canModerateMember(guild, member) {
  return moderatabilityState(guild, member).ok;
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
  manageabilityState,
  moderatabilityState,
  hasAnyDangerousPermission,
  isStaffLike
};
