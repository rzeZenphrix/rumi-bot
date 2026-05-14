const { PermissionFlagsBits } = require('discord.js');

const logger = require('../logging/logger');
const giveawayStore = require('../giveaways/store');

const inviteCache = new Map();
const vanityCache = new Map();
const inviteAccessWarnings = new Set();

function cacheKey(guildId) {
  return String(guildId);
}

function serializeInvite(invite) {
  return {
    code: invite.code,
    uses: invite.uses || 0,
    maxUses: invite.maxUses || 0,
    inviterId: invite.inviter?.id || null,
    channelId: invite.channel?.id || invite.channelId || null,
    createdTimestamp: invite.createdTimestamp || null,
    temporary: invite.temporary === true
  };
}

function canFetchInvites(guild) {
  const me = guild?.members?.me;
  return Boolean(me?.permissions?.has?.(PermissionFlagsBits.ManageGuild));
}

function noteInviteAccessIssue(guild, error = null) {
  const guildId = guild?.id;
  if (!guildId) return;

  const key = cacheKey(guildId);
  if (inviteAccessWarnings.has(key) && process.env.DEBUG_ERRORS !== 'true') return;
  inviteAccessWarnings.add(key);

  if (process.env.DEBUG_ERRORS === 'true') {
    logger.warn(
      {
        guildId,
        code: error?.code || error?.rawError?.code || null,
        status: error?.status || null,
        message: error?.message || 'Missing Manage Server permission'
      },
      'Anti-raid invite tracking paused for guild; missing Manage Server permission'
    );
  }
}

async function fetchGuildInvites(guild) {
  if (!guild?.invites?.fetch) return new Map();
  if (!canFetchInvites(guild)) {
    noteInviteAccessIssue(guild);
    return new Map();
  }

  const invites = await guild.invites.fetch().catch((error) => {
    const code = Number(error?.code || error?.rawError?.code || 0);
    const status = Number(error?.status || error?.rawError?.status || 0);

    if (code === 50013 || code === 50001 || status === 403) {
      noteInviteAccessIssue(guild, error);
      return null;
    }

    logger.warn(
      {
        guildId: guild?.id,
        code: code || null,
        status: status || null,
        message: error?.message || String(error)
      },
      'Anti-raid could not fetch guild invites'
    );

    return null;
  });

  if (!invites) return new Map();

  return new Map(
    invites.map((invite) => [invite.code, serializeInvite(invite)])
  );
}

async function fetchVanity(guild) {
  if (!guild?.fetchVanityData) return null;

  return guild.fetchVanityData().catch(() => null);
}

async function snapshotInvites(guild) {
  const invites = await fetchGuildInvites(guild);
  inviteCache.set(cacheKey(guild.id), invites);

  for (const invite of invites.values()) {
    await giveawayStore.recordInviteSnapshot({
      guild_id: guild.id,
      code: invite.code,
      inviter_user_id: invite.inviterId,
      channel_id: invite.channelId,
      uses: Number(invite.uses || 0),
      max_uses: Number(invite.maxUses || 0),
      source: 'discord'
    }).catch(() => null);
  }

  const vanity = await fetchVanity(guild);
  if (vanity) {
    vanityCache.set(cacheKey(guild.id), {
      code: vanity.code || null,
      uses: vanity.uses || 0
    });
  }

  return invites;
}

function getCachedInvites(guildId) {
  return inviteCache.get(cacheKey(guildId)) || new Map();
}

function getCachedVanity(guildId) {
  return vanityCache.get(cacheKey(guildId)) || null;
}

async function resolveUsedInvite(guild) {
  const before = getCachedInvites(guild.id);
  const after = await fetchGuildInvites(guild);

  let used = null;

  for (const [code, invite] of after.entries()) {
    const previous = before.get(code);

    if (!previous) continue;

    if (Number(invite.uses || 0) > Number(previous.uses || 0)) {
      used = {
        code,
        before: previous,
        after: invite,
        inviterId: invite.inviterId,
        channelId: invite.channelId,
        usesDelta: Number(invite.uses || 0) - Number(previous.uses || 0)
      };

      break;
    }
  }

  /**
   * New invite may have appeared and already got used.
   */
  if (!used) {
    for (const [code, invite] of after.entries()) {
      if (!before.has(code) && Number(invite.uses || 0) > 0) {
        used = {
          code,
          before: null,
          after: invite,
          inviterId: invite.inviterId,
          channelId: invite.channelId,
          usesDelta: Number(invite.uses || 0)
        };

        break;
      }
    }
  }

  inviteCache.set(cacheKey(guild.id), after);

  for (const invite of after.values()) {
    await giveawayStore.recordInviteSnapshot({
      guild_id: guild.id,
      code: invite.code,
      inviter_user_id: invite.inviterId,
      channel_id: invite.channelId,
      uses: Number(invite.uses || 0),
      max_uses: Number(invite.maxUses || 0),
      source: invite.vanity ? 'vanity' : 'discord'
    }).catch(() => null);
  }

  /**
   * Vanity fallback.
   */
  if (!used) {
    const previousVanity = getCachedVanity(guild.id);
    const vanity = await fetchVanity(guild);

    if (vanity) {
      const current = {
        code: vanity.code || null,
        uses: vanity.uses || 0
      };

      if (previousVanity && Number(current.uses || 0) > Number(previousVanity.uses || 0)) {
        used = {
          code: current.code || 'vanity',
          before: previousVanity,
          after: current,
          inviterId: null,
          channelId: null,
          usesDelta: Number(current.uses || 0) - Number(previousVanity.uses || 0),
          vanity: true
        };
      }

      vanityCache.set(cacheKey(guild.id), current);
    }
  }

  return used;
}

async function handleInviteCreate(invite) {
  if (!invite.guild) return null;

  const guildId = invite.guild.id;
  const cached = getCachedInvites(guildId);

  cached.set(invite.code, serializeInvite(invite));
  inviteCache.set(cacheKey(guildId), cached);

  return cached.get(invite.code);
}

async function handleInviteDelete(invite) {
  if (!invite.guild) return null;

  const guildId = invite.guild.id;
  const cached = getCachedInvites(guildId);
  const existing = cached.get(invite.code) || null;

  cached.delete(invite.code);
  inviteCache.set(cacheKey(guildId), cached);

  return existing;
}

function clearGuildInvites(guildId) {
  inviteCache.delete(cacheKey(guildId));
  vanityCache.delete(cacheKey(guildId));
}

module.exports = {
  snapshotInvites,
  resolveUsedInvite,
  handleInviteCreate,
  handleInviteDelete,
  clearGuildInvites,
  getCachedInvites,
  getCachedVanity
};
