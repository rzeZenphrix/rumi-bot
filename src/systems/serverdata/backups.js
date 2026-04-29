const crypto = require('node:crypto');
const { ChannelType, PermissionsBitField } = require('discord.js');
const db = require('../../services/database');
const logger = require('../logging/logger');
const { getRoleAutomationConfig, updateRoleAutomationConfig } = require('../automation/serverRoles');
const { getBoosterRoleSettings, listBoostRewardRoles } = require('../boosterroles/store');
const { getTrustNobodySettings, saveTrustNobodySettings } = require('../security/trustNobody');
const { listAutoresponders, listAutoresponderExclusives, listAutoreactions, listAutoreactionExclusives } = require('../automation/messageAutomation');

const versionSnapshotDebounce = new Map();

function nowIso() {
  return new Date().toISOString();
}

function confirmToken() {
  return crypto.randomBytes(6).toString('hex').toUpperCase();
}

async function queryData(query, context) {
  const { data } = await db.runQuery(query, context);
  return data;
}

async function listSnapshots(guildId, snapshotKind, limit = 10) {
  let query = db.supabase
    .from('server_snapshots')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(limit, 50)));

  if (snapshotKind) {
    query = query.eq('snapshot_kind', snapshotKind);
  }

  return queryData(query, 'listServerSnapshots');
}

async function getSnapshotById(guildId, snapshotId) {
  return queryData(
    db.supabase
      .from('server_snapshots')
      .select('*')
      .eq('guild_id', guildId)
      .eq('id', snapshotId)
      .maybeSingle(),
    'getServerSnapshotById'
  );
}

async function saveSnapshot(row) {
  return queryData(
    db.supabase
      .from('server_snapshots')
      .insert(row)
      .select()
      .single(),
    'saveServerSnapshot'
  );
}

async function saveRestoreJob(row) {
  return queryData(
    db.supabase
      .from('server_restore_jobs')
      .insert(row)
      .select()
      .single(),
    'saveServerRestoreJob'
  );
}

async function getRestoreJob(guildId, token) {
  return queryData(
    db.supabase
      .from('server_restore_jobs')
      .select('*')
      .eq('guild_id', guildId)
      .eq('confirm_token', token)
      .maybeSingle(),
    'getServerRestoreJob'
  );
}

async function updateRestoreJob(jobId, patch) {
  return queryData(
    db.supabase
      .from('server_restore_jobs')
      .update(patch)
      .eq('id', jobId)
      .select()
      .single(),
    'updateServerRestoreJob'
  );
}

async function markSnapshotRestored(snapshotId) {
  return queryData(
    db.supabase
      .from('server_snapshots')
      .update({ restored_at: nowIso() })
      .eq('id', snapshotId)
      .select()
      .single(),
    'markServerSnapshotRestored'
  );
}

function serializePermissionOverwrites(channel) {
  return channel.permissionOverwrites.cache.map((overwrite) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow.bitfield.toString(),
    deny: overwrite.deny.bitfield.toString()
  }));
}

function serializeRole(role) {
  return {
    id: role.id,
    name: role.name,
    color: role.color,
    hoist: role.hoist,
    mentionable: role.mentionable,
    permissions: role.permissions.bitfield.toString(),
    position: role.rawPosition,
    managed: role.managed,
    unicodeEmoji: role.unicodeEmoji || null,
    icon: role.iconURL?.({ size: 256 }) || null
  };
}

function serializeChannel(channel) {
  return {
    id: channel.id,
    type: channel.type,
    name: channel.name,
    topic: 'topic' in channel ? channel.topic || null : null,
    nsfw: 'nsfw' in channel ? Boolean(channel.nsfw) : false,
    rateLimitPerUser: 'rateLimitPerUser' in channel ? channel.rateLimitPerUser || 0 : 0,
    bitrate: 'bitrate' in channel ? channel.bitrate || null : null,
    userLimit: 'userLimit' in channel ? channel.userLimit || null : null,
    parentId: channel.parentId || null,
    position: channel.rawPosition,
    permissionOverwrites: serializePermissionOverwrites(channel)
  };
}

async function snapshotBotData(guildId) {
  const [
    guildSettings,
    securityConfig,
    roleAutomationConfig,
    boosterSettings,
    boostRewardRoles,
    trustNobody,
    autoresponders,
    autoresponderExclusives,
    autoreactions,
    autoreactionExclusives,
    versionControlConfig
  ] = await Promise.all([
    db.getGuildSettings(guildId).catch(() => null),
    db.getGuildSecurityConfig(guildId).catch(() => null),
    getRoleAutomationConfig(guildId).catch(() => null),
    getBoosterRoleSettings(guildId).catch(() => null),
    listBoostRewardRoles(guildId).catch(() => []),
    getTrustNobodySettings(guildId).catch(() => null),
    listAutoresponders(guildId).catch(() => []),
    listAutoresponderExclusives(guildId).catch(() => []),
    listAutoreactions(guildId).catch(() => []),
    listAutoreactionExclusives(guildId).catch(() => []),
    db.getKv('serverdata:versioncontrol', guildId, { enabled: false }).catch(() => ({ enabled: false }))
  ]);

  return {
    guildSettings,
    securityConfig,
    roleAutomationConfig,
    boosterSettings,
    boostRewardRoles,
    trustNobody,
    autoresponders,
    autoresponderExclusives,
    autoreactions,
    autoreactionExclusives,
    versionControlConfig
  };
}

async function captureGuildSnapshot(guild, { kind, reason = null, createdBy = null, triggerType = null, includesMembers = false } = {}) {
  if (includesMembers) {
    await guild.members.fetch().catch(() => null);
  }

  const roles = guild.roles.cache
    .filter((role) => role.id !== guild.id)
    .sort((left, right) => left.rawPosition - right.rawPosition)
    .map(serializeRole);
  const channels = guild.channels.cache
    .filter((channel) => !channel.isThread?.())
    .sort((left, right) => left.rawPosition - right.rawPosition)
    .map(serializeChannel);
  const members = includesMembers
    ? guild.members.cache.map((member) => ({
        id: member.id,
        nickname: member.nickname || null,
        roles: member.roles.cache.filter((role) => role.id !== guild.id).map((role) => role.id)
      }))
    : [];

  const snapshot = {
    guild: {
      id: guild.id,
      name: guild.name,
      description: guild.description || null,
      verificationLevel: guild.verificationLevel,
      afkChannelId: guild.afkChannelId || null,
      icon: guild.iconURL?.({ size: 256 }) || null
    },
    roles,
    channels,
    members,
    botData: await snapshotBotData(guild.id)
  };

  return saveSnapshot({
    guild_id: guild.id,
    snapshot_kind: kind,
    reason,
    created_by: createdBy,
    trigger_type: triggerType,
    includes_members: includesMembers,
    snapshot_json: snapshot,
    metadata_json: {
      roleCount: roles.length,
      channelCount: channels.length,
      memberCount: members.length
    }
  });
}

function restorePreviewFromSnapshot(guild, snapshot) {
  const payload = snapshot.snapshot_json || {};
  const snapshotRoles = Array.isArray(payload.roles) ? payload.roles : [];
  const snapshotChannels = Array.isArray(payload.channels) ? payload.channels : [];

  const currentRoleIds = new Set(guild.roles.cache.keys());
  const currentChannelIds = new Set(guild.channels.cache.keys());

  const missingRoles = snapshotRoles.filter((role) => !currentRoleIds.has(role.id));
  const missingChannels = snapshotChannels.filter((channel) => !currentChannelIds.has(channel.id));
  const changedRoles = snapshotRoles.filter((role) => {
    const current = guild.roles.cache.get(role.id);
    if (!current) return false;
    return (
      current.name !== role.name ||
      current.color !== role.color ||
      current.hoist !== role.hoist ||
      current.mentionable !== role.mentionable
    );
  });
  const changedChannels = snapshotChannels.filter((channel) => {
    const current = guild.channels.cache.get(channel.id);
    if (!current) return false;
    return current.name !== channel.name || current.parentId !== channel.parentId;
  });

  return {
    missingRoles: missingRoles.length,
    missingChannels: missingChannels.length,
    changedRoles: changedRoles.length,
    changedChannels: changedChannels.length,
    includesMembers: Boolean(snapshot.includes_members),
    roleCount: snapshotRoles.length,
    channelCount: snapshotChannels.length
  };
}

async function createRestorePreview(guild, snapshot, requestedBy) {
  const preview = restorePreviewFromSnapshot(guild, snapshot);
  const token = confirmToken();

  const job = await saveRestoreJob({
    guild_id: guild.id,
    snapshot_id: snapshot.id,
    requested_by: requestedBy,
    confirm_token: token,
    status: 'preview_ready',
    preview_json: preview,
    result_json: {}
  });

  return {
    job,
    preview,
    token
  };
}

async function applyRoleRestore(guild, snapshotRoles = []) {
  const roleMap = new Map();
  let created = 0;
  let updated = 0;

  for (const data of snapshotRoles.filter((role) => !role.managed).sort((left, right) => left.position - right.position)) {
    let role = guild.roles.cache.get(data.id) || null;
    if (!role) {
      role = await guild.roles.create({
        name: data.name,
        permissions: BigInt(data.permissions || '0'),
        hoist: Boolean(data.hoist),
        mentionable: Boolean(data.mentionable),
        color: Number(data.color || 0),
        reason: 'Server snapshot restore'
      }).catch(() => null);
      if (role) created += 1;
    } else {
      await role.edit({
        name: data.name,
        permissions: BigInt(data.permissions || '0'),
        hoist: Boolean(data.hoist),
        mentionable: Boolean(data.mentionable),
        color: Number(data.color || 0),
        reason: 'Server snapshot restore'
      }).catch(() => null);
      updated += 1;
    }

    if (!role) continue;
    roleMap.set(data.id, role.id);
    if (data.unicodeEmoji) {
      await role.setUnicodeEmoji(data.unicodeEmoji, 'Server snapshot restore').catch(() => null);
    }
  }

  for (const data of snapshotRoles.filter((role) => !role.managed).sort((left, right) => left.position - right.position)) {
    const roleId = roleMap.get(data.id) || data.id;
    const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
    if (role) {
      await role.setPosition(data.position, { reason: 'Server snapshot restore' }).catch(() => null);
    }
  }

  return { roleMap, created, updated };
}

function mapOverwriteTargetId(targetId, roleMap) {
  return roleMap.get(targetId) || targetId;
}

function buildOverwritePayload(overwrites = [], roleMap = new Map()) {
  return overwrites.map((entry) => ({
    id: mapOverwriteTargetId(entry.id, roleMap),
    type: entry.type,
    allow: new PermissionsBitField(BigInt(entry.allow || '0')),
    deny: new PermissionsBitField(BigInt(entry.deny || '0'))
  }));
}

async function applyChannelRestore(guild, snapshotChannels = [], roleMap = new Map()) {
  const channelMap = new Map();
  let created = 0;
  let updated = 0;

  const categories = snapshotChannels.filter((channel) => channel.type === ChannelType.GuildCategory);
  const others = snapshotChannels.filter((channel) => channel.type !== ChannelType.GuildCategory);

  for (const data of [...categories, ...others]) {
    const parentId = data.parentId ? channelMap.get(data.parentId) || data.parentId : null;
    let channel = guild.channels.cache.get(data.id) || null;

    const editPayload = {
      name: data.name,
      parent: parentId,
      rateLimitPerUser: data.rateLimitPerUser || 0,
      nsfw: Boolean(data.nsfw),
      reason: 'Server snapshot restore',
      permissionOverwrites: buildOverwritePayload(data.permissionOverwrites, roleMap)
    };

    if (data.topic != null) editPayload.topic = data.topic;
    if (data.userLimit != null) editPayload.userLimit = data.userLimit;
    if (data.bitrate != null) editPayload.bitrate = data.bitrate;

    if (!channel) {
      channel = await guild.channels.create({
        ...editPayload,
        type: data.type
      }).catch(() => null);
      if (channel) created += 1;
    } else {
      await channel.edit(editPayload).catch(() => null);
      updated += 1;
    }

    if (!channel) continue;
    channelMap.set(data.id, channel.id);
    await channel.setPosition(data.position).catch(() => null);
  }

  return { channelMap, created, updated };
}

async function restoreBotData(guildId, botData, roleMap = new Map()) {
  if (botData.guildSettings) {
    await db.updateGuildSettings(guildId, {
      prefix: botData.guildSettings.prefix,
      thresholds_json: botData.guildSettings.thresholds_json,
      settings_json: botData.guildSettings.settings_json
    }).catch(() => null);
  }

  if (botData.securityConfig) {
    await db.updateGuildSecurityConfig(guildId, () => botData.securityConfig).catch(() => null);
  }

  if (botData.roleAutomationConfig) {
    await updateRoleAutomationConfig(guildId, () => botData.roleAutomationConfig).catch(() => null);
  }

  if (botData.trustNobody) {
    await saveTrustNobodySettings(guildId, {
      enabled: Boolean(botData.trustNobody.enabled),
      updated_by: botData.trustNobody.updated_by || botData.trustNobody.created_by || null,
      activated_at: botData.trustNobody.activated_at || null
    }).catch(() => null);
  }

  if (botData.versionControlConfig) {
    await db.setKv('serverdata:versioncontrol', guildId, botData.versionControlConfig).catch(() => null);
  }

  if (Array.isArray(botData.boostRewardRoles)) {
    const mapped = botData.boostRewardRoles
      .map((entry) => roleMap.get(entry.role_id) || entry.role_id)
      .filter(Boolean);
    for (const roleId of mapped) {
      await queryData(
        db.supabase
          .from('boost_reward_roles')
          .upsert({ guild_id: guildId, role_id: roleId }, { onConflict: 'guild_id,role_id' })
          .select()
          .single(),
        'restoreBoostRewardRole'
      ).catch(() => null);
    }
  }
}

async function applyRestoreJob(guild, token) {
  const job = await getRestoreJob(guild.id, token);
  if (!job) {
    const error = new Error('That restore confirmation token is invalid.');
    error.code = 'RESTORE_TOKEN_INVALID';
    throw error;
  }

  const snapshot = await getSnapshotById(guild.id, job.snapshot_id);
  if (!snapshot) {
    const error = new Error('That snapshot no longer exists.');
    error.code = 'SNAPSHOT_NOT_FOUND';
    throw error;
  }

  const payload = snapshot.snapshot_json || {};
  const roleResult = await applyRoleRestore(guild, payload.roles || []);
  const channelResult = await applyChannelRestore(guild, payload.channels || [], roleResult.roleMap);

  if (snapshot.includes_members && Array.isArray(payload.members)) {
    for (const entry of payload.members) {
      const member = await guild.members.fetch(entry.id).catch(() => null);
      if (!member) continue;
      const targetRoleIds = entry.roles
        .map((roleId) => roleResult.roleMap.get(roleId) || roleId)
        .filter((roleId) => guild.roles.cache.has(roleId));
      await member.roles.set(targetRoleIds).catch(() => null);
    }
  }

  await restoreBotData(guild.id, payload.botData || {}, roleResult.roleMap).catch(() => null);
  await updateRestoreJob(job.id, {
    status: 'applied',
    result_json: {
      rolesCreated: roleResult.created,
      rolesUpdated: roleResult.updated,
      channelsCreated: channelResult.created,
      channelsUpdated: channelResult.updated
    }
  }).catch(() => null);
  await markSnapshotRestored(snapshot.id).catch(() => null);

  return {
    snapshot,
    result: {
      rolesCreated: roleResult.created,
      rolesUpdated: roleResult.updated,
      channelsCreated: channelResult.created,
      channelsUpdated: channelResult.updated
    }
  };
}

async function getVersionControlConfig(guildId) {
  return db.getKv('serverdata:versioncontrol', guildId, {
    enabled: false,
    lastBaselineAt: null
  });
}

async function setVersionControlConfig(guildId, patch = {}) {
  const current = await getVersionControlConfig(guildId);
  const next = typeof patch === 'function' ? patch(current) : { ...current, ...(patch || {}) };
  await db.setKv('serverdata:versioncontrol', guildId, next);
  return next;
}

async function pruneVersionSnapshots(guildId) {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  await queryData(
    db.supabase
      .from('server_snapshots')
      .delete()
      .eq('guild_id', guildId)
      .eq('snapshot_kind', 'version_control')
      .lt('created_at', cutoff)
      .select(),
    'pruneVersionSnapshots'
  ).catch(() => null);
}

async function recordVersionSnapshot(guild, reason, triggerType = 'unknown') {
  const config = await getVersionControlConfig(guild.id).catch(() => ({ enabled: false }));
  if (!config.enabled) return null;

  const debounceKey = `${guild.id}:${triggerType}`;
  const last = versionSnapshotDebounce.get(debounceKey) || 0;
  if (Date.now() - last < 15000) return null;
  versionSnapshotDebounce.set(debounceKey, Date.now());

  await pruneVersionSnapshots(guild.id).catch(() => null);
  return captureGuildSnapshot(guild, {
    kind: 'version_control',
    reason,
    triggerType,
    includesMembers: false
  });
}

module.exports = {
  captureGuildSnapshot,
  listSnapshots,
  getSnapshotById,
  createRestorePreview,
  applyRestoreJob,
  getVersionControlConfig,
  setVersionControlConfig,
  recordVersionSnapshot
};
