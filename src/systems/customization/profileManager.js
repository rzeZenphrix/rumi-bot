const logger = require('../logging/logger');
const { PermissionFlagsBits } = require('discord.js');
const { fetchBuffer } = require('../../utils/media');
const {
  getGuildCustomization,
  isCustomizationEnabled
} = require('./customizationStore');

const MAX_PROFILE_ASSET_BYTES = Number(process.env.CUSTOMIZATION_ASSET_MAX_BYTES || 8 * 1024 * 1024);

async function resolveAsset(url) {
  if (!url) return null;
  return fetchBuffer(url, { maxBytes: MAX_PROFILE_ASSET_BYTES, timeoutMs: 20000 });
}

function classifyProfileError(error) {
  const text = String(error?.message || '').toLowerCase();

  if (text.includes('missing permissions')) return 'I am missing permission to change that part of my server profile.';
  if (text.includes('request entity too large') || text.includes('file too large')) return 'That image is too large for Discord to accept.';
  if (text.includes('invalid form body')) return 'Discord rejected that profile value.';
  return error?.message || 'Discord rejected the profile update.';
}

function profileState(config = {}) {
  return {
    nick: config.botProfile?.nickname || null,
    avatar: config.botProfile?.avatarUrl || null,
    banner: config.botProfile?.bannerUrl || null,
    bio: config.botProfile?.bio || null
  };
}

async function buildProfileFieldPatch(field, value) {
  if (field === 'nickname') return { nick: value || null };
  if (field === 'bio') return { bio: value || null };
  if (field === 'avatar') return { avatar: (await resolveAsset(value)) || null };
  if (field === 'banner') return { banner: (await resolveAsset(value)) || null };
  return null;
}

async function applyProfileField(guild, me, state, field) {
  if (field === 'nickname' && !me.permissions.has(PermissionFlagsBits.ChangeNickname)) {
    return {
      field,
      ok: false,
      reason: 'I am missing Change Nickname.'
    };
  }

  let patch = null;

  try {
    patch = await buildProfileFieldPatch(field, state[field]);
    if (!patch) {
      return {
        field,
        ok: false,
        reason: 'That profile field is not supported.'
      };
    }

    await guild.members.editMe(patch);
    return { field, ok: true };
  } catch (error) {
    logger.warn(
      { error, guildId: guild.id, field, patchKeys: Object.keys(patch || {}) },
      'Failed to apply one guild profile customization field'
    );

    return {
      field,
      ok: false,
      reason: classifyProfileError(error)
    };
  }
}

async function applyGuildProfile(guild, options = {}) {
  if (!guild || !isCustomizationEnabled()) {
    return { ok: false, reason: 'Customization disabled or guild missing.' };
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) return { ok: false, reason: 'Bot member unavailable.' };

  const config = options.config || getGuildCustomization(guild.id);
  const state = profileState(config);
  const patchResults = [];
  const skipped = [];

  try {
    const fields = ['avatar', 'banner', 'bio'];
    if (options.includeNickname !== false && (state.nick !== null || me.nickname)) {
      fields.unshift('nickname');
    }

    for (const field of fields) {
      const result = await applyProfileField(guild, me, state, field);
      patchResults.push(result);
    }
  } catch (error) {
    logger.warn({ error, guildId: guild.id }, 'Failed to fetch customization asset');
    return { ok: false, reason: 'I could not download the customization image you saved.' };
  }

  const failed = patchResults.filter((entry) => !entry.ok);
  if (failed.length) {
    return {
      ok: false,
      applied: state,
      failed,
      skipped,
      reason: failed.map((entry) => `${entry.field}: ${entry.reason}`).join(' | ')
    };
  }

  return { ok: true, applied: state, skipped };
}

async function applyGuildProfilesOnStartup(client) {
  if (!client?.guilds?.cache?.size || !isCustomizationEnabled()) return;

  for (const guild of client.guilds.cache.values()) {
    await applyGuildProfile(guild).catch((error) => {
      logger.warn({ error, guildId: guild.id }, 'Startup guild profile customization failed');
    });
  }
}

module.exports = {
  applyGuildProfile,
  applyGuildProfilesOnStartup
};
