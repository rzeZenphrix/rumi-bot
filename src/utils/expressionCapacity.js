const EMOJI_LIMIT_BY_TIER = {
  0: 50,
  1: 100,
  2: 150,
  3: 250
};

const STICKER_LIMIT_BY_TIER = {
  0: 5,
  1: 15,
  2: 30,
  3: 60
};

function premiumTier(guild) {
  const tier = Number(guild?.premiumTier ?? guild?.premium_tier ?? 0);
  return Number.isInteger(tier) && tier >= 0 ? Math.min(tier, 3) : 0;
}

async function fetchFreshGuild(guild) {
  return guild?.fetch ? await guild.fetch().catch(() => guild) : guild;
}

async function fetchEmojiCollection(guild) {
  const fresh = await fetchFreshGuild(guild);
  const collection = await fresh?.emojis?.fetch?.().catch(() => null);
  return collection || fresh?.emojis?.cache || guild?.emojis?.cache;
}

async function fetchStickerCollection(guild) {
  const fresh = await fetchFreshGuild(guild);
  const collection = await fresh?.stickers?.fetch?.().catch(() => null);
  return collection || fresh?.stickers?.cache || guild?.stickers?.cache;
}

function values(collection) {
  return [...(collection?.values?.() || [])];
}

function countEmojiSlots(collection, animated = false) {
  return values(collection).filter((emoji) => Boolean(emoji.animated) === Boolean(animated)).length;
}

async function getGuildEmojiCapacity(guild, options = {}) {
  const fresh = await fetchFreshGuild(guild);
  const animated = Boolean(options.animated);
  const collection = await fetchEmojiCollection(fresh);
  const limit = Number(fresh?.maximumEmojis || guild?.maximumEmojis || EMOJI_LIMIT_BY_TIER[premiumTier(fresh)] || 50);
  const used = countEmojiSlots(collection, animated);

  return {
    type: animated ? 'animated emoji' : 'emoji',
    animated,
    used,
    limit,
    remaining: Math.max(0, limit - used)
  };
}

async function getGuildStickerCapacity(guild) {
  const fresh = await fetchFreshGuild(guild);
  const collection = await fetchStickerCollection(fresh);
  const limit = Number(fresh?.maximumStickers || guild?.maximumStickers || STICKER_LIMIT_BY_TIER[premiumTier(fresh)] || 5);
  const used = values(collection).length;

  return {
    type: 'sticker',
    used,
    limit,
    remaining: Math.max(0, limit - used)
  };
}

async function hasExpressionCapacity(guild, type, options = {}) {
  const capacity = type === 'sticker'
    ? await getGuildStickerCapacity(guild)
    : await getGuildEmojiCapacity(guild, options);

  return {
    ...capacity,
    ok: capacity.used < capacity.limit
  };
}

function discordCreationErrorMessage(error, fallback = 'Discord rejected that expression.') {
  const code = Number(error?.code || error?.rawError?.code || 0);
  const status = Number(error?.status || 0);
  const message = String(error?.rawError?.message || error?.message || '').trim();

  if (code === 50013 || status === 403 || /missing permissions/i.test(message)) {
    return 'I am missing Manage Expressions or another required Discord permission.';
  }

  if (/maximum|limit|slots?|capacity/i.test(message)) {
    return 'Discord says this server has no matching expression slots left.';
  }

  if (/file|image|size|invalid|mime|format/i.test(message)) {
    return 'Discord rejected the file. Check that the image format and size are valid.';
  }

  return message ? `Discord rejected it: ${message}` : fallback;
}

module.exports = {
  getGuildEmojiCapacity,
  getGuildStickerCapacity,
  hasExpressionCapacity,
  discordCreationErrorMessage,
  fetchEmojiCollection,
  fetchStickerCollection
};
