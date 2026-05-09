const { Routes } = require('discord.js');
const db = require('../../services/database');
const logger = require('../logging/logger');

const PROFILE_NS = 'customization:guildProfiles';

const IMAGE_FIELDS = new Set(['avatar', 'banner']);
const TEXT_FIELDS = new Set(['nick', 'nickname', 'bio']);

const FIELD_ALIASES = {
  nickname: 'nick'
};

const MAX_IMAGE_BYTES = Number(process.env.PROFILE_IMAGE_MAX_BYTES || 8 * 1024 * 1024);

function profileKey(guildId) {
  return String(guildId);
}

function normalizeField(field) {
  const key = String(field || '').trim().toLowerCase();
  return FIELD_ALIASES[key] || key;
}

function isDataUri(value) {
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,/i.test(String(value || ''));
}

function isImageUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function inferMime(contentType, url = '') {
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();

  if (['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'].includes(type)) {
    return type === 'image/jpg' ? 'image/jpeg' : type;
  }

  const lower = String(url || '').toLowerCase();

  if (lower.includes('.png')) return 'image/png';
  if (lower.includes('.jpg') || lower.includes('.jpeg')) return 'image/jpeg';
  if (lower.includes('.gif')) return 'image/gif';
  if (lower.includes('.webp')) return 'image/webp';

  return null;
}

async function fetchImageAsDataUri(url) {
  const target = String(url || '').trim();

  if (!target) return null;
  if (isDataUri(target)) return target;

  if (!isImageUrl(target)) {
    throw new Error('Image must be a valid http(s) URL or data URI.');
  }

  const response = await fetch(target, {
    redirect: 'follow',
    headers: {
      'user-agent': 'RumiBot/1.0 (+https://rumi.rocks)',
      accept: 'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8'
    }
  }).catch((error) => {
    throw new Error(`Could not fetch image: ${error.message}`);
  });

  if (!response || !response.ok) {
    throw new Error(`Could not fetch image: HTTP ${response?.status || 'unknown'}`);
  }

  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength && contentLength > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`);
  }

  const mime = inferMime(response.headers.get('content-type'), target);
  if (!mime) {
    throw new Error('URL did not return a supported image type.');
  }

  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (!buffer.length) {
    throw new Error('Image download was empty.');
  }

  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large. Max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB.`);
  }

  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function sanitizeTextField(field, value) {
  if (value === null) return null;

  const text = String(value || '').trim();

  if (!text) return null;

  if (field === 'nick') {
    return text.slice(0, 32);
  }

  if (field === 'bio') {
    return text.slice(0, 190);
  }

  return text;
}

async function getGuildProfile(guildId) {
  return db.getKv(PROFILE_NS, profileKey(guildId), {
    nick: null,
    avatar: null,
    banner: null,
    bio: null,
    updatedAt: null,
    updatedBy: null
  });
}

async function saveGuildProfile(guildId, profile) {
  const next = {
    nick: profile.nick ?? null,
    avatar: profile.avatar ?? null,
    banner: profile.banner ?? null,
    bio: profile.bio ?? null,
    updatedAt: new Date().toISOString(),
    updatedBy: profile.updatedBy ?? null
  };

  await db.setKv(PROFILE_NS, profileKey(guildId), next);
  return next;
}

async function buildPatch(profile, options = {}) {
  const patch = {};
  const errors = [];

  if ('nick' in profile) {
    patch.nick = sanitizeTextField('nick', profile.nick);
  }

  if ('bio' in profile) {
    patch.bio = sanitizeTextField('bio', profile.bio);
  }

  for (const field of IMAGE_FIELDS) {
    if (!(field in profile)) continue;

    const value = profile[field];

    if (!value) {
      patch[field] = null;
      continue;
    }

    try {
      patch[field] = await fetchImageAsDataUri(value);
    } catch (error) {
      errors.push({
        field,
        message: error.message
      });

      if (options.strictImages) {
        throw error;
      }
    }
  }

  return {
    patch,
    errors
  };
}

async function patchCurrentGuildMember(guild, patch, reason) {
  if (!guild?.client?.rest) {
    throw new Error('Discord REST client is unavailable.');
  }

  if (!patch || !Object.keys(patch).length) {
    return null;
  }

  const route = Routes.guildMember(guild.id, '@me');

  const updated = await guild.client.rest.patch(route, {
    body: patch,
    reason
  });

  await guild.members.fetchMe({ force: true }).catch(() => null);

  return updated;
}

async function applyGuildProfile(guild, options = {}) {
  const profile = await getGuildProfile(guild.id);
  const { patch, errors } = await buildPatch(profile, {
    strictImages: false
  });

  if (!Object.keys(patch).length) {
    return {
      ok: true,
      applied: [],
      skipped: errors
    };
  }

  const updated = await patchCurrentGuildMember(
    guild,
    patch,
    options.reason || 'Apply Rumi server profile customization'
  );

  for (const error of errors) {
    logger.warn(
      {
        guildId: guild.id,
        field: error.field,
        error: error.message
      },
      'Skipped invalid guild profile image field'
    );
  }

  return {
    ok: true,
    updated,
    applied: Object.keys(patch),
    skipped: errors
  };
}

async function applyProfileField(guild, field, value, options = {}) {
  const normalized = normalizeField(field);

  if (!IMAGE_FIELDS.has(normalized) && !TEXT_FIELDS.has(normalized)) {
    throw new Error(`Unsupported profile field: ${field}`);
  }

  const current = await getGuildProfile(guild.id);
  const next = {
    ...current,
    updatedBy: options.actorId || current.updatedBy || null
  };

  if (IMAGE_FIELDS.has(normalized)) {
    if (!value) {
      next[normalized] = null;
    } else {
      next[normalized] = await fetchImageAsDataUri(value);
    }
  } else {
    next[normalized] = sanitizeTextField(normalized, value);
  }

  const saved = await saveGuildProfile(guild.id, next);

  const { patch } = await buildPatch(
    {
      [normalized]: saved[normalized]
    },
    {
      strictImages: true
    }
  );

  await patchCurrentGuildMember(
    guild,
    patch,
    options.reason || `Update Rumi profile field: ${normalized}`
  );

  return {
    ok: true,
    field: normalized,
    value: saved[normalized],
    applied: Object.keys(patch)
  };
}

async function clearProfileField(guild, field, options = {}) {
  return applyProfileField(guild, field, null, options);
}

async function updateGuildProfile(guild, patch, options = {}) {
  const current = await getGuildProfile(guild.id);
  const next = {
    ...current,
    updatedBy: options.actorId || current.updatedBy || null
  };

  for (const [rawField, rawValue] of Object.entries(patch || {})) {
    const field = normalizeField(rawField);

    if (IMAGE_FIELDS.has(field)) {
      next[field] = rawValue ? await fetchImageAsDataUri(rawValue) : null;
    }

    if (TEXT_FIELDS.has(field)) {
      next[field] = sanitizeTextField(field, rawValue);
    }
  }

  await saveGuildProfile(guild.id, next);

  return applyGuildProfile(guild, {
    reason: options.reason || 'Update Rumi server profile customization'
  });
}

async function applyGuildProfilesOnStartup(client) {
  for (const guild of client.guilds.cache.values()) {
    await applyGuildProfile(guild, {
      reason: 'Apply Rumi server profile customization on startup'
    }).catch((error) => {
      logger.warn(
        {
          error,
          guildId: guild.id
        },
        'Failed to apply guild profile customization on startup'
      );
    });
  }
}

module.exports = {
  PROFILE_NS,
  getGuildProfile,
  saveGuildProfile,
  buildPatch,
  applyGuildProfile,
  applyProfileField,
  clearProfileField,
  updateGuildProfile,
  applyGuildProfilesOnStartup
};