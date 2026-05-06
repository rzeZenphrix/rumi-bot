const { PermissionFlagsBits } = require('discord.js');

const DANGEROUS_PERMISSION_BITS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ModerateMembers,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.MentionEveryone,
  PermissionFlagsBits.ManageGuildExpressions
];

const DANGEROUS_PERMISSION_NAMES = {
  [PermissionFlagsBits.Administrator.toString()]: 'Administrator',
  [PermissionFlagsBits.ManageGuild.toString()]: 'Manage Server',
  [PermissionFlagsBits.ManageRoles.toString()]: 'Manage Roles',
  [PermissionFlagsBits.ManageChannels.toString()]: 'Manage Channels',
  [PermissionFlagsBits.ManageWebhooks.toString()]: 'Manage Webhooks',
  [PermissionFlagsBits.BanMembers.toString()]: 'Ban Members',
  [PermissionFlagsBits.KickMembers.toString()]: 'Kick Members',
  [PermissionFlagsBits.ModerateMembers.toString()]: 'Timeout Members',
  [PermissionFlagsBits.ManageMessages.toString()]: 'Manage Messages',
  [PermissionFlagsBits.MentionEveryone.toString()]: 'Mention Everyone',
  [PermissionFlagsBits.ManageGuildExpressions.toString()]: 'Manage Expressions'
};

function permissionName(bit) {
  return DANGEROUS_PERMISSION_NAMES[bit.toString()] || bit.toString();
}

function detectRolePermissionEscalation(oldRole, newRole) {
  const added = [];

  for (const bit of DANGEROUS_PERMISSION_BITS) {
    if (!oldRole.permissions.has(bit) && newRole.permissions.has(bit)) {
      added.push({
        bit: bit.toString(),
        name: permissionName(bit)
      });
    }
  }

  return {
    escalated: added.length > 0,
    added
  };
}

function detectRoleHierarchyEscalation(oldRole, newRole) {
  return {
    escalated: Number(newRole.position || 0) > Number(oldRole.position || 0),
    oldPosition: oldRole.position,
    newPosition: newRole.position
  };
}

function overwriteSnapshot(channel) {
  return [...(channel.permissionOverwrites?.cache?.values?.() || [])].map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  }));
}

function overwriteChanged(oldChannel, newChannel) {
  const oldData = JSON.stringify(overwriteSnapshot(oldChannel).sort((a, b) => a.id.localeCompare(b.id)));
  const newData = JSON.stringify(overwriteSnapshot(newChannel).sort((a, b) => a.id.localeCompare(b.id)));

  return oldData !== newData;
}

module.exports = {
  DANGEROUS_PERMISSION_BITS,
  detectRolePermissionEscalation,
  detectRoleHierarchyEscalation,
  overwriteSnapshot,
  overwriteChanged
};