const { AuditLogEvent } = require('discord.js');

const PUNISHMENT_TYPES = Object.freeze([
  'none',
  'alert',
  'staff_strip',
  'strip',
  'timeout',
  'kick',
  'ban',
  'jail',
  'lockdown'
]);

const ROLLBACK_MODES = Object.freeze([
  'off',
  'basic',
  'standard',
  'aggressive'
]);

const ACTIONS = Object.freeze({
  channel_delete: {
    label: 'Channel Delete',
    aliases: ['channeldelete', 'channel-delete', 'channelDelete'],
    auditType: AuditLogEvent.ChannelDelete,
    weight: 10,
    limit: 3,
    windowSeconds: 20,
    rollback: 'standard'
  },
  channel_create: {
    label: 'Channel Create',
    aliases: ['channelcreate', 'channel-create', 'channelCreate'],
    auditType: AuditLogEvent.ChannelCreate,
    weight: 5,
    limit: 6,
    windowSeconds: 20,
    rollback: 'basic'
  },
  channel_update: {
    label: 'Channel Update',
    aliases: ['channelupdate', 'channel-update', 'channelUpdate'],
    auditType: AuditLogEvent.ChannelUpdate,
    weight: 5,
    limit: 5,
    windowSeconds: 30,
    rollback: 'standard'
  },
  role_delete: {
    label: 'Role Delete',
    aliases: ['roledelete', 'role-delete', 'roleDelete'],
    auditType: AuditLogEvent.RoleDelete,
    weight: 10,
    limit: 3,
    windowSeconds: 20,
    rollback: 'standard'
  },
  role_create: {
    label: 'Role Create',
    aliases: ['rolecreate', 'role-create', 'roleCreate'],
    auditType: AuditLogEvent.RoleCreate,
    weight: 5,
    limit: 6,
    windowSeconds: 20,
    rollback: 'basic'
  },
  role_update: {
    label: 'Role Update',
    aliases: ['roleupdate', 'role-update', 'roleUpdate'],
    auditType: AuditLogEvent.RoleUpdate,
    weight: 5,
    limit: 5,
    windowSeconds: 30,
    rollback: 'standard'
  },
  role_permission_escalation: {
    label: 'Role Permission Escalation',
    aliases: ['rolepermescalation', 'role-permission-escalation', 'rolePermissionEscalation', 'perm-escalation'],
    auditType: AuditLogEvent.RoleUpdate,
    weight: 14,
    limit: 1,
    windowSeconds: 15,
    rollback: 'basic'
  },
  member_ban_add: {
    label: 'Member Ban',
    aliases: ['banadd', 'ban-add', 'memberbanadd', 'member-ban-add', 'banAdd'],
    auditType: AuditLogEvent.MemberBanAdd,
    weight: 8,
    limit: 5,
    windowSeconds: 20,
    rollback: 'aggressive'
  },
  member_kick: {
    label: 'Member Kick',
    aliases: ['kick', 'memberkick', 'member-kick'],
    auditType: AuditLogEvent.MemberKick,
    weight: 7,
    limit: 5,
    windowSeconds: 20,
    rollback: 'off'
  },
  member_role_add: {
    label: 'Member Role Add',
    aliases: ['memberroleadd', 'member-role-add', 'role-add'],
    auditType: AuditLogEvent.MemberRoleUpdate,
    weight: 4,
    limit: 8,
    windowSeconds: 30,
    rollback: 'standard'
  },
  member_role_remove: {
    label: 'Member Role Remove',
    aliases: ['memberroleremove', 'member-role-remove', 'role-remove'],
    auditType: AuditLogEvent.MemberRoleUpdate,
    weight: 4,
    limit: 8,
    windowSeconds: 30,
    rollback: 'standard'
  },
  webhook_create: {
    label: 'Webhook Create',
    aliases: ['webhookcreate', 'webhook-create', 'webhookCreate'],
    auditType: AuditLogEvent.WebhookCreate,
    weight: 7,
    limit: 3,
    windowSeconds: 30,
    rollback: 'basic'
  },
  webhook_delete: {
    label: 'Webhook Delete',
    aliases: ['webhookdelete', 'webhook-delete', 'webhookDelete'],
    auditType: AuditLogEvent.WebhookDelete,
    weight: 7,
    limit: 3,
    windowSeconds: 30,
    rollback: 'standard'
  },
  webhook_update: {
    label: 'Webhook Update',
    aliases: ['webhookupdate', 'webhook-update', 'webhookUpdate'],
    auditType: AuditLogEvent.WebhookUpdate,
    weight: 5,
    limit: 4,
    windowSeconds: 30,
    rollback: 'standard'
  },
  emoji_delete: {
    label: 'Emoji Delete',
    aliases: ['emojidelete', 'emoji-delete', 'emojiDelete'],
    auditType: AuditLogEvent.EmojiDelete,
    weight: 4,
    limit: 5,
    windowSeconds: 30,
    rollback: 'standard'
  },
  sticker_delete: {
    label: 'Sticker Delete',
    aliases: ['stickerdelete', 'sticker-delete', 'stickerDelete'],
    auditType: AuditLogEvent.StickerDelete,
    weight: 4,
    limit: 5,
    windowSeconds: 30,
    rollback: 'standard'
  },
  bot_add: {
    label: 'Bot Add',
    aliases: ['botadd', 'bot-add', 'botAdd'],
    auditType: AuditLogEvent.BotAdd,
    weight: 12,
    limit: 1,
    windowSeconds: 60,
    rollback: 'basic'
  },
  guild_update: {
    label: 'Guild Update',
    aliases: ['guildupdate', 'guild-update', 'guildUpdate', 'server-update'],
    auditType: AuditLogEvent.GuildUpdate,
    weight: 8,
    limit: 2,
    windowSeconds: 30,
    rollback: 'standard'
  },
  invite_create: {
    label: 'Invite Create',
    aliases: ['invitecreate', 'invite-create', 'inviteCreate'],
    auditType: AuditLogEvent.InviteCreate,
    weight: 2,
    limit: 10,
    windowSeconds: 60,
    rollback: 'basic',
    enabled: false
  },
  invite_delete: {
    label: 'Invite Delete',
    aliases: ['invitedelete', 'invite-delete', 'inviteDelete'],
    auditType: AuditLogEvent.InviteDelete,
    weight: 2,
    limit: 10,
    windowSeconds: 60,
    rollback: 'standard',
    enabled: false
  },
  emoji_create: {
    label: 'Emoji Create',
    aliases: ['emojicreate', 'emoji-create', 'emojiCreate'],
    auditType: AuditLogEvent.EmojiCreate,
    weight: 3,
    limit: 6,
    windowSeconds: 30,
    rollback: 'basic',
    enabled: false
  },
  emoji_update: {
    label: 'Emoji Update',
    aliases: ['emojiupdate', 'emoji-update', 'emojiUpdate'],
    auditType: AuditLogEvent.EmojiUpdate,
    weight: 3,
    limit: 6,
    windowSeconds: 30,
    rollback: 'standard',
    enabled: false
  },
  sticker_create: {
    label: 'Sticker Create',
    aliases: ['stickercreate', 'sticker-create', 'stickerCreate'],
    auditType: AuditLogEvent.StickerCreate,
    weight: 3,
    limit: 6,
    windowSeconds: 30,
    rollback: 'basic',
    enabled: false
  },
  sticker_update: {
    label: 'Sticker Update',
    aliases: ['stickerupdate', 'sticker-update', 'stickerUpdate'],
    auditType: AuditLogEvent.StickerUpdate,
    weight: 3,
    limit: 6,
    windowSeconds: 30,
    rollback: 'standard',
    enabled: false
  }
});

const ACTION_ALIASES = new Map();

for (const [id, action] of Object.entries(ACTIONS)) {
  ACTION_ALIASES.set(id.toLowerCase(), id);
  ACTION_ALIASES.set(id.replaceAll('_', '-').toLowerCase(), id);
  ACTION_ALIASES.set(id.replaceAll('_', '').toLowerCase(), id);

  for (const alias of action.aliases || []) {
    ACTION_ALIASES.set(String(alias).toLowerCase(), id);
  }
}

function normalizeActionId(value = '') {
  const key = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');

  return ACTION_ALIASES.get(key) || ACTION_ALIASES.get(key.replaceAll('-', '')) || null;
}

function normalizePunishment(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replaceAll('-', '_');

  if (normalized === 'staffstrip') return 'staff_strip';
  if (normalized === 'stripstaff') return 'staff_strip';

  return PUNISHMENT_TYPES.includes(normalized) ? normalized : null;
}

function normalizePunishments(value) {
  const source = Array.isArray(value) ? value : [value];

  const normalized = source
    .flatMap((item) => String(item || '').split(/[,\s]+/g))
    .map(normalizePunishment)
    .filter(Boolean);

  return [...new Set(normalized)];
}

function normalizeRollbackMode(value = '') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  return ROLLBACK_MODES.includes(normalized) ? normalized : null;
}

module.exports = {
  ACTIONS,
  ACTION_ALIASES,
  PUNISHMENT_TYPES,
  ROLLBACK_MODES,
  normalizeActionId,
  normalizePunishment,
  normalizePunishments,
  normalizeRollbackMode
};