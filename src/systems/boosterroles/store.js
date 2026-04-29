const db = require('../../services/database');
const logger = require('../logging/logger');
const { fetchBuffer, firstAttachment, customEmojiInfo } = require('../../utils/media');

const ROLE_ICON_MAX_BYTES = Number(process.env.BOOSTER_ROLE_ICON_MAX_BYTES || 256 * 1024);
const NSFW_ICON_PATTERN = /(nsfw|porn|hentai|nude|sex|boob|xxx|18\+|erotic)/i;

function nowIso() {
  return new Date().toISOString();
}

async function queryData(query, context) {
  const { data } = await db.runQuery(query, context);
  return data;
}

function defaultSettings(guildId) {
  return {
    guild_id: guildId,
    creation_enabled: true,
    share_limit: null,
    auto_cleanup: false,
    icon_nsfw_filter: false,
    top_role_id: null,
    bottom_role_id: null,
    name_filters_json: [],
    regex_filters_json: [],
    last_cleanup_at: null,
    last_cleanup_note: null,
    created_by: null,
    updated_by: null
  };
}

function normalizeSettings(row, guildId) {
  const base = defaultSettings(guildId);
  return {
    ...base,
    ...(row || {}),
    name_filters_json: Array.isArray(row?.name_filters_json) ? row.name_filters_json : [],
    regex_filters_json: Array.isArray(row?.regex_filters_json) ? row.regex_filters_json : []
  };
}

function memberIsBooster(member) {
  return Boolean(member?.premiumSinceTimestamp);
}

function guildSupportsRoleIcons(guild) {
  return Number(guild?.premiumTier || 0) >= 2;
}

function rawIconTextLooksNsfw(text = '') {
  return NSFW_ICON_PATTERN.test(String(text || ''));
}

function validateRoleName(name, settings) {
  const value = String(name || '').trim();
  if (!value) return { ok: false, reason: 'Give the custom role a name.' };
  if (value.length > 100) return { ok: false, reason: 'Role names can be up to 100 characters.' };

  const lowered = value.toLowerCase();
  for (const blocked of settings.name_filters_json || []) {
    const token = String(blocked || '').trim().toLowerCase();
    if (token && lowered.includes(token)) {
      return { ok: false, reason: `That role name matched the blocked word \`${blocked}\`.` };
    }
  }

  for (const pattern of settings.regex_filters_json || []) {
    try {
      const regex = new RegExp(String(pattern), 'iu');
      if (regex.test(value)) {
        return { ok: false, reason: `That role name matched the blocked regex \`${pattern}\`.` };
      }
    } catch (_error) {
      continue;
    }
  }

  return { ok: true, value };
}

async function getBoosterRoleSettings(guildId) {
  const row = await queryData(
    db.supabase
      .from('booster_role_settings')
      .select('*')
      .eq('guild_id', guildId)
      .maybeSingle(),
    'getBoosterRoleSettings'
  );
  return normalizeSettings(row, guildId);
}

async function saveBoosterRoleSettings(guildId, patch = {}) {
  const current = await getBoosterRoleSettings(guildId).catch(() => defaultSettings(guildId));
  return queryData(
    db.supabase
      .from('booster_role_settings')
      .upsert(
        {
          ...current,
          ...patch,
          guild_id: guildId
        },
        { onConflict: 'guild_id' }
      )
      .select()
      .single(),
    'saveBoosterRoleSettings'
  );
}

async function updateBoosterRoleSettings(guildId, updater, updatedBy = null) {
  const current = await getBoosterRoleSettings(guildId);
  const next = typeof updater === 'function' ? updater(current) : { ...current, ...(updater || {}) };
  return saveBoosterRoleSettings(guildId, {
    ...next,
    updated_by: updatedBy || next.updated_by || current.updated_by || null
  });
}

async function listBoosterRoles(guildId) {
  return queryData(
    db.supabase
      .from('booster_owned_roles')
      .select('*')
      .eq('guild_id', guildId)
      .eq('active', true)
      .order('created_at', { ascending: true }),
    'listBoosterRoles'
  );
}

async function getBoosterRoleForOwner(guildId, ownerUserId) {
  return queryData(
    db.supabase
      .from('booster_owned_roles')
      .select('*')
      .eq('guild_id', guildId)
      .eq('owner_user_id', ownerUserId)
      .maybeSingle(),
    'getBoosterRoleForOwner'
  );
}

async function saveBoosterRoleRecord(record) {
  return queryData(
    db.supabase
      .from('booster_owned_roles')
      .upsert(record, { onConflict: 'guild_id,owner_user_id' })
      .select()
      .single(),
    'saveBoosterRoleRecord'
  );
}

async function deleteBoosterRoleRecord(recordId) {
  return queryData(
    db.supabase
      .from('booster_owned_roles')
      .delete()
      .eq('id', recordId)
      .select(),
    'deleteBoosterRoleRecord'
  );
}

async function listBoosterRoleShares(guildId, ownedRoleId = null) {
  let query = db.supabase
    .from('booster_role_shares')
    .select('*')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: true });

  if (ownedRoleId) {
    query = query.eq('owned_role_id', ownedRoleId);
  }

  return queryData(query, 'listBoosterRoleShares');
}

async function upsertBoosterRoleShare(row) {
  return queryData(
    db.supabase
      .from('booster_role_shares')
      .upsert(row, { onConflict: 'guild_id,owner_user_id,target_user_id' })
      .select()
      .single(),
    'upsertBoosterRoleShare'
  );
}

async function removeBoosterRoleShare(guildId, ownerUserId, targetUserId) {
  return queryData(
    db.supabase
      .from('booster_role_shares')
      .delete()
      .eq('guild_id', guildId)
      .eq('owner_user_id', ownerUserId)
      .eq('target_user_id', targetUserId)
      .select(),
    'removeBoosterRoleShare'
  );
}

async function removeBoosterRoleSharesForRecord(recordId) {
  return queryData(
    db.supabase
      .from('booster_role_shares')
      .delete()
      .eq('owned_role_id', recordId)
      .select(),
    'removeBoosterRoleSharesForRecord'
  );
}

async function listBoostRewardRoles(guildId) {
  return queryData(
    db.supabase
      .from('boost_reward_roles')
      .select('*')
      .eq('guild_id', guildId)
      .order('created_at', { ascending: true }),
    'listBoostRewardRoles'
  );
}

async function addBoostRewardRole(guildId, roleId, createdBy = null) {
  return queryData(
    db.supabase
      .from('boost_reward_roles')
      .upsert(
        {
          guild_id: guildId,
          role_id: roleId,
          created_by: createdBy
        },
        { onConflict: 'guild_id,role_id' }
      )
      .select()
      .single(),
    'addBoostRewardRole'
  );
}

async function removeBoostRewardRole(guildId, roleId) {
  return queryData(
    db.supabase
      .from('boost_reward_roles')
      .delete()
      .eq('guild_id', guildId)
      .eq('role_id', roleId)
      .select(),
    'removeBoostRewardRole'
  );
}

function splitIconInput(input) {
  return String(input || '').trim();
}

async function resolveRoleIconPayload(client, message, input) {
  const raw = splitIconInput(input);
  if (!raw && !firstAttachment(message)) {
    return null;
  }

  if (raw.toLowerCase() === 'clear') {
    return { mode: 'clear', raw };
  }

  const attachment = firstAttachment(message);
  if (attachment?.url) {
    const buffer = await fetchBuffer(attachment.url, {
      maxBytes: ROLE_ICON_MAX_BYTES,
      timeoutMs: 20000
    });
    return {
      mode: 'image',
      buffer,
      raw: attachment.name || raw || attachment.url,
      source: {
        type: 'attachment',
        name: attachment.name || 'icon'
      }
    };
  }

  const emoji = customEmojiInfo(raw);
  if (emoji) {
    if (!client?.emojis?.cache?.has?.(emoji.id)) {
      const error = new Error('That custom emoji is not available in a server I can see.');
      error.code = 'EMOJI_UNAVAILABLE';
      throw error;
    }

    const buffer = await fetchBuffer(emoji.url, {
      maxBytes: ROLE_ICON_MAX_BYTES,
      timeoutMs: 20000
    });

    return {
      mode: 'image',
      buffer,
      raw,
      source: {
        type: 'emoji',
        id: emoji.id,
        name: emoji.name
      }
    };
  }

  if (/^https?:\/\//i.test(raw)) {
    const buffer = await fetchBuffer(raw, {
      maxBytes: ROLE_ICON_MAX_BYTES,
      timeoutMs: 20000
    });
    return {
      mode: 'image',
      buffer,
      raw,
      source: {
        type: 'url',
        url: raw
      }
    };
  }

  return {
    mode: 'emoji',
    unicodeEmoji: raw,
    raw,
    source: {
      type: 'unicode',
      value: raw
    }
  };
}

async function getManagedBoosterRole(guild, ownerUserId) {
  const record = await getBoosterRoleForOwner(guild.id, ownerUserId);
  if (!record) return { record: null, role: null };
  const role = guild.roles.cache.get(record.role_id) || await guild.roles.fetch(record.role_id).catch(() => null);
  return { record, role };
}

async function repositionBoosterRoles(guild, settings = null) {
  const config = settings || await getBoosterRoleSettings(guild.id);
  if (!config.top_role_id || !config.bottom_role_id) {
    return { ok: false, reason: 'No hoist range is configured yet.', moved: 0 };
  }

  const topRole = guild.roles.cache.get(config.top_role_id) || await guild.roles.fetch(config.top_role_id).catch(() => null);
  const bottomRole = guild.roles.cache.get(config.bottom_role_id) || await guild.roles.fetch(config.bottom_role_id).catch(() => null);

  if (!topRole || !bottomRole) {
    return { ok: false, reason: 'One of the hoist anchor roles no longer exists.', moved: 0 };
  }

  if (topRole.comparePositionTo(bottomRole) <= 0) {
    return { ok: false, reason: 'The top role must be above the bottom role.', moved: 0 };
  }

  const records = await listBoosterRoles(guild.id);
  const roles = records
    .map((record) => ({
      record,
      role: guild.roles.cache.get(record.role_id) || null
    }))
    .filter((entry) => entry.role)
    .sort((left, right) => left.role.rawPosition - right.role.rawPosition);

  let nextPosition = bottomRole.rawPosition + 1;
  const maxPosition = topRole.rawPosition - 1;
  let moved = 0;

  for (const entry of roles) {
    if (nextPosition > maxPosition) break;
    await entry.role.setPosition(nextPosition, { reason: 'Booster role hoist sync' }).catch(() => null);
    nextPosition += 1;
    moved += 1;
  }

  return { ok: true, moved };
}

async function createBoosterRole(guild, member, name, actorId = null) {
  const settings = await getBoosterRoleSettings(guild.id);
  const validation = validateRoleName(name, settings);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.code = 'INVALID_NAME';
    throw error;
  }

  if (!settings.creation_enabled) {
    const error = new Error('Booster role creation is disabled on this server right now.');
    error.code = 'CREATION_DISABLED';
    throw error;
  }

  const existing = await getManagedBoosterRole(guild, member.id);
  if (existing.record && existing.role) {
    const error = new Error('You already have a booster role on this server.');
    error.code = 'ALREADY_EXISTS';
    throw error;
  }

  if (existing.record && !existing.role) {
    await deleteBoosterRoleRecord(existing.record.id).catch(() => null);
  }

  const role = await guild.roles.create({
    name: validation.value,
    mentionable: true,
    hoist: false,
    reason: `Booster role created for ${member.user.tag}`
  });

  const record = await saveBoosterRoleRecord({
    guild_id: guild.id,
    owner_user_id: member.id,
    role_id: role.id,
    role_name: role.name,
    primary_color: null,
    secondary_color: null,
    icon_source_json: {},
    metadata_json: {},
    active: true,
    created_by: actorId || member.id,
    updated_by: actorId || member.id
  });

  await member.roles.add(role, 'Booster role created').catch(() => null);
  await repositionBoosterRoles(guild, settings).catch(() => null);

  return { record, role, settings };
}

async function renameBoosterRole(guild, record, role, nextName, actorId = null) {
  const settings = await getBoosterRoleSettings(guild.id);
  const validation = validateRoleName(nextName, settings);
  if (!validation.ok) {
    const error = new Error(validation.reason);
    error.code = 'INVALID_NAME';
    throw error;
  }

  const updatedRole = await role.edit({
    name: validation.value,
    reason: `Booster role rename by ${actorId || record.owner_user_id}`
  });

  const saved = await saveBoosterRoleRecord({
    ...record,
    role_name: updatedRole.name,
    updated_by: actorId || record.owner_user_id
  });

  return { record: saved, role: updatedRole };
}

async function setBoosterRoleColors(record, role, primaryColor, secondaryColor = null, actorId = null) {
  let updatedRole = role;

  if (secondaryColor != null) {
    try {
      updatedRole = await role.setColors(
        {
          primaryColor,
          secondaryColor
        },
        `Booster role color update by ${actorId || record.owner_user_id}`
      );
    } catch (error) {
      const wrapped = new Error('That server does not support gradient role colors here yet.');
      wrapped.code = 'GRADIENT_UNAVAILABLE';
      wrapped.cause = error;
      throw wrapped;
    }
  } else {
    updatedRole = await role.setColor(primaryColor, `Booster role color update by ${actorId || record.owner_user_id}`);
  }

  const saved = await saveBoosterRoleRecord({
    ...record,
    primary_color: primaryColor == null ? null : String(primaryColor),
    secondary_color: secondaryColor == null ? null : String(secondaryColor),
    updated_by: actorId || record.owner_user_id
  });

  return { record: saved, role: updatedRole };
}

async function setBoosterRoleIcon(guild, client, message, record, role, input, actorId = null) {
  const payload = await resolveRoleIconPayload(client, message, input);
  if (!payload) {
    const error = new Error('Give me an emoji, attachment, image URL, or `clear`.');
    error.code = 'ICON_INPUT_REQUIRED';
    throw error;
  }

  let updatedRole = role;
  if (payload.mode === 'clear') {
    updatedRole = await role.edit({ icon: null, unicodeEmoji: null, reason: 'Booster role icon cleared' });
  } else if (payload.mode === 'emoji') {
    updatedRole = await role.setUnicodeEmoji(payload.unicodeEmoji, 'Booster role icon updated');
  } else {
    updatedRole = await role.setIcon(payload.buffer, 'Booster role icon updated');
  }

  const saved = await saveBoosterRoleRecord({
    ...record,
    icon_source_json: payload.mode === 'clear' ? {} : payload.source || {},
    updated_by: actorId || record.owner_user_id
  });

  return { record: saved, role: updatedRole, payload };
}

async function shareBoosterRole(guild, ownerMember, targetMember) {
  const { record, role } = await getManagedBoosterRole(guild, ownerMember.id);
  if (!record || !role) {
    const error = new Error('That booster does not have an active custom role yet.');
    error.code = 'ROLE_NOT_FOUND';
    throw error;
  }

  await targetMember.roles.add(role, `Booster role shared by ${ownerMember.user.tag}`);
  const share = await upsertBoosterRoleShare({
    guild_id: guild.id,
    owned_role_id: record.id,
    owner_user_id: ownerMember.id,
    target_user_id: targetMember.id,
    role_id: role.id
  });

  return { record, role, share };
}

async function unshareBoosterRole(guild, ownerMember, targetMember) {
  const { record, role } = await getManagedBoosterRole(guild, ownerMember.id);
  if (!record || !role) {
    const error = new Error('That booster role could not be found anymore.');
    error.code = 'ROLE_NOT_FOUND';
    throw error;
  }

  await targetMember.roles.remove(role, `Booster role unshared by ${ownerMember.user.tag}`).catch(() => null);
  await removeBoosterRoleShare(guild.id, ownerMember.id, targetMember.id);
  return { record, role };
}

async function syncBoostRewardRoles(member, shouldHaveRewards) {
  const rewards = await listBoostRewardRoles(member.guild.id).catch(() => []);
  const roleIds = rewards.map((entry) => entry.role_id);
  if (!roleIds.length) return { added: 0, removed: 0 };

  let added = 0;
  let removed = 0;
  for (const roleId of roleIds) {
    const role = member.guild.roles.cache.get(roleId) || await member.guild.roles.fetch(roleId).catch(() => null);
    if (!role) continue;

    if (shouldHaveRewards && !member.roles.cache.has(role.id)) {
      await member.roles.add(role, 'Boost reward sync').then(() => { added += 1; }).catch(() => null);
    }
    if (!shouldHaveRewards && member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Boost reward sync').then(() => { removed += 1; }).catch(() => null);
    }
  }

  return { added, removed };
}

async function removeOwnedBoosterRole(guild, record, reason = 'Booster role cleanup') {
  const role = guild.roles.cache.get(record.role_id) || await guild.roles.fetch(record.role_id).catch(() => null);
  if (role) {
    await role.delete(reason).catch(() => null);
  }
  await removeBoosterRoleSharesForRecord(record.id).catch(() => null);
  await deleteBoosterRoleRecord(record.id).catch(() => null);
}

async function cleanupBoosterRoles(guild, { automatic = false, actorId = null } = {}) {
  const records = await listBoosterRoles(guild.id);
  const shares = await listBoosterRoleShares(guild.id);
  const settings = await getBoosterRoleSettings(guild.id);

  let deletedRoles = 0;
  let removedShares = 0;
  let untouched = 0;

  for (const record of records) {
    const owner = await guild.members.fetch(record.owner_user_id).catch(() => null);
    const role = guild.roles.cache.get(record.role_id) || await guild.roles.fetch(record.role_id).catch(() => null);

    if (!owner || !memberIsBooster(owner) || !role) {
      await removeOwnedBoosterRole(guild, record, automatic ? 'Automatic booster role cleanup' : 'Manual booster role cleanup');
      deletedRoles += 1;
      continue;
    }

    untouched += 1;
  }

  for (const share of shares) {
    const target = await guild.members.fetch(share.target_user_id).catch(() => null);
    const ownedRecord = records.find((entry) => entry.id === share.owned_role_id);
    if (!target || !ownedRecord) {
      await db.runQuery(
        db.supabase
          .from('booster_role_shares')
          .delete()
          .eq('id', share.id),
        'cleanupBoosterRoleShare'
      ).catch(() => null);
      removedShares += 1;
    }
  }

  await saveBoosterRoleSettings(guild.id, {
    ...settings,
    last_cleanup_at: nowIso(),
    last_cleanup_note: automatic ? 'automatic' : `manual:${actorId || 'unknown'}`,
    updated_by: actorId || settings.updated_by || null
  }).catch(() => null);

  return {
    deletedRoles,
    removedShares,
    untouched
  };
}

async function syncBoosterState(oldMember, newMember) {
  const before = memberIsBooster(oldMember);
  const after = memberIsBooster(newMember);
  const settings = await getBoosterRoleSettings(newMember.guild.id).catch(() => defaultSettings(newMember.guild.id));

  if (before !== after) {
    await syncBoostRewardRoles(newMember, after).catch(() => null);
  }

  if (after) {
    const { record, role } = await getManagedBoosterRole(newMember.guild, newMember.id).catch(() => ({ record: null, role: null }));
    if (record && role && !newMember.roles.cache.has(role.id)) {
      await newMember.roles.add(role, 'Booster role ownership sync').catch(() => null);
    }
  }

  if (before && !after) {
    const { record } = await getManagedBoosterRole(newMember.guild, newMember.id).catch(() => ({ record: null }));
    if (record) {
      await removeOwnedBoosterRole(newMember.guild, record, 'Booster no longer active').catch(() => null);
    }
  }

  if (settings.auto_cleanup) {
    await cleanupBoosterRoles(newMember.guild, { automatic: true }).catch(() => null);
  }
}

module.exports = {
  ROLE_ICON_MAX_BYTES,
  defaultSettings,
  memberIsBooster,
  guildSupportsRoleIcons,
  rawIconTextLooksNsfw,
  validateRoleName,
  getBoosterRoleSettings,
  saveBoosterRoleSettings,
  updateBoosterRoleSettings,
  listBoosterRoles,
  getBoosterRoleForOwner,
  getManagedBoosterRole,
  listBoosterRoleShares,
  listBoostRewardRoles,
  addBoostRewardRole,
  removeBoostRewardRole,
  resolveRoleIconPayload,
  repositionBoosterRoles,
  createBoosterRole,
  renameBoosterRole,
  setBoosterRoleColors,
  setBoosterRoleIcon,
  shareBoosterRole,
  unshareBoosterRole,
  syncBoostRewardRoles,
  cleanupBoosterRoles,
  syncBoosterState
};
