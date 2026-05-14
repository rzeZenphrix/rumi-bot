const { PermissionFlagsBits } = require('discord.js');

const db = require('../../services/database');
const logger = require('../logging/logger');

const cache = new Map();
const inviteAccessWarnings = new Set();

function q(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return `'${String(value).replace(/'/g, "''")}'`;
}

function qJson(value) {
  return `${q(JSON.stringify(value || {}))}::jsonb`;
}

async function run(query, context = {}) {
  const result = await db.runQuery(query, {
    system: 'inviteTracker',
    ...context
  });

  if (Array.isArray(result?.data)) return result.data;
  if (result?.data) return [result.data];

  return [];
}

async function one(query, context = {}) {
  const rows = await run(query, context);
  return rows[0] || null;
}

function canFetchInvites(guild) {
  const me = guild.members.me;
  if (!me) return false;
  return me.permissions.has(PermissionFlagsBits.ManageGuild);
}

function noteInviteAccessIssue(guild, error = null) {
  const guildId = guild?.id;
  if (!guildId) return;

  if (inviteAccessWarnings.has(guildId) && process.env.DEBUG_ERRORS !== 'true') return;
  inviteAccessWarnings.add(guildId);

  if (process.env.DEBUG_ERRORS === 'true') {
    logger.warn(
      {
        guildId,
        code: error?.code || error?.rawError?.code || null,
        status: error?.status || null,
        message: error?.message || 'Missing Manage Server permission'
      },
      'Invite tracking paused for guild; missing Manage Server permission'
    );
  }
}

async function getSettings(guildId) {
  const row = await one(
    `SELECT * FROM rumi_invite_tracker_settings WHERE guild_id = ${q(guildId)} LIMIT 1`,
    { guildId }
  );

  return row || {
    guild_id: guildId,
    enabled: true,
    log_channel_id: null
  };
}

async function updateSettings(guildId, patch = {}) {
  const current = await getSettings(guildId);

  const next = {
    enabled: patch.enabled ?? current.enabled ?? true,
    log_channel_id: patch.log_channel_id === undefined ? current.log_channel_id : patch.log_channel_id
  };

  await run(
    `
    INSERT INTO rumi_invite_tracker_settings (guild_id, enabled, log_channel_id, updated_at)
    VALUES (${q(guildId)}, ${q(next.enabled)}, ${q(next.log_channel_id)}, NOW())
    ON CONFLICT (guild_id)
    DO UPDATE SET
      enabled = EXCLUDED.enabled,
      log_channel_id = EXCLUDED.log_channel_id,
      updated_at = NOW()
    `,
    { guildId }
  );

  return getSettings(guildId);
}

async function fetchVanity(guild) {
  if (!guild.features?.includes?.('VANITY_URL')) return null;

  const data = await guild.fetchVanityData().catch(() => null);
  if (!data?.code) return null;

  return {
    code: data.code,
    uses: Number(data.uses || 0)
  };
}

async function fetchSnapshot(guild) {
  const invites = new Map();

  if (canFetchInvites(guild)) {
    const fetched = await guild.invites.fetch().catch((error) => {
      const code = Number(error?.code || error?.rawError?.code || 0);
      const status = Number(error?.status || error?.rawError?.status || 0);

      if (code === 50013 || code === 50001 || status === 403) {
        noteInviteAccessIssue(guild, error);
        return null;
      }

      logger.warn(
        {
          guildId: guild.id,
          code: code || null,
          status: status || null,
          message: error?.message || String(error)
        },
        'Could not fetch guild invites'
      );
      return null;
    });

    if (fetched) {
      for (const invite of fetched.values()) {
        invites.set(invite.code, {
          code: invite.code,
          inviterId: invite.inviter?.id || invite.inviterId || null,
          channelId: invite.channel?.id || invite.channelId || null,
          uses: Number(invite.uses || 0),
          maxUses: invite.maxUses ?? null,
          temporary: Boolean(invite.temporary),
          createdAt: invite.createdTimestamp ? new Date(invite.createdTimestamp).toISOString() : null
        });
      }
    }
  } else {
    noteInviteAccessIssue(guild);
  }

  const vanity = await fetchVanity(guild).catch(() => null);

  return {
    invites,
    vanity,
    fetchedAt: Date.now()
  };
}

async function loadStoredSnapshot(guildId) {
  const rows = await run(
    `
    SELECT code, inviter_id, channel_id, uses, max_uses, temporary, created_at_discord
    FROM rumi_invite_tracker_invites
    WHERE guild_id = ${q(guildId)}
      AND deleted_at IS NULL
    `,
    { guildId }
  );

  const invites = new Map();

  for (const row of rows) {
    invites.set(row.code, {
      code: row.code,
      inviterId: row.inviter_id || null,
      channelId: row.channel_id || null,
      uses: Number(row.uses || 0),
      maxUses: row.max_uses ?? null,
      temporary: Boolean(row.temporary),
      createdAt: row.created_at_discord || null
    });
  }

  return {
    invites,
    vanity: null,
    fetchedAt: Date.now()
  };
}

async function saveSnapshot(guildId, snapshot) {
  for (const invite of snapshot.invites.values()) {
    await run(
      `
      INSERT INTO rumi_invite_tracker_invites (
        guild_id,
        code,
        inviter_id,
        channel_id,
        uses,
        max_uses,
        temporary,
        created_at_discord,
        deleted_at,
        last_seen_at
      )
      VALUES (
        ${q(guildId)},
        ${q(invite.code)},
        ${q(invite.inviterId)},
        ${q(invite.channelId)},
        ${q(invite.uses)},
        ${q(invite.maxUses)},
        ${q(invite.temporary)},
        ${q(invite.createdAt)},
        NULL,
        NOW()
      )
      ON CONFLICT (guild_id, code)
      DO UPDATE SET
        inviter_id = EXCLUDED.inviter_id,
        channel_id = EXCLUDED.channel_id,
        uses = EXCLUDED.uses,
        max_uses = EXCLUDED.max_uses,
        temporary = EXCLUDED.temporary,
        created_at_discord = COALESCE(EXCLUDED.created_at_discord, rumi_invite_tracker_invites.created_at_discord),
        deleted_at = NULL,
        last_seen_at = NOW()
      `,
      { guildId, inviteCode: invite.code }
    );
  }
}

function detectUsedInvite(previous, current) {
  let best = null;

  for (const invite of current.invites.values()) {
    const old = previous.invites.get(invite.code);
    const previousUses = Number(old?.uses || 0);
    const currentUses = Number(invite.uses || 0);
    const diff = currentUses - previousUses;

    if (diff > 0 && (!best || diff > best.diff)) {
      best = {
        source: 'invite',
        code: invite.code,
        inviterId: invite.inviterId || null,
        channelId: invite.channelId || null,
        uses: currentUses,
        previousUses,
        diff
      };
    }
  }

  if (best) return best;

  const previousVanityUses = Number(previous.vanity?.uses || 0);
  const currentVanityUses = Number(current.vanity?.uses || 0);

  if (current.vanity?.code && currentVanityUses > previousVanityUses) {
    return {
      source: 'vanity',
      code: current.vanity.code,
      inviterId: null,
      channelId: null,
      uses: currentVanityUses,
      previousUses: previousVanityUses,
      diff: currentVanityUses - previousVanityUses
    };
  }

  return {
    source: 'unknown',
    code: null,
    inviterId: null,
    channelId: null,
    uses: null,
    previousUses: null,
    diff: 0
  };
}

async function initGuild(guild) {
  const snapshot = await fetchSnapshot(guild);
  cache.set(guild.id, snapshot);
  await saveSnapshot(guild.id, snapshot).catch(() => null);

  workerLog('invite cache initialized', {
    guildId: guild.id,
    invites: snapshot.invites.size,
    vanity: snapshot.vanity?.code || null
  });

  return snapshot;
}

async function initClient(client) {
  let count = 0;

  for (const guild of client.guilds.cache.values()) {
    await initGuild(guild).then(() => {
      count += 1;
    }).catch((error) => {
      logger.warn({ error, guildId: guild.id }, 'Invite cache init failed');
    });
  }

  logger.info({ guilds: count }, 'Invite tracker initialized');
}

function workerLog(label, data = {}) {
  if (process.env.INVITE_TRACKER_DEBUG === 'true') {
    console.log(`[rumi-invites] ${label}`, data);
  }
}

async function trackInviteCreate(invite) {
  if (!invite?.guild) return;

  const snapshot = cache.get(invite.guild.id) || await fetchSnapshot(invite.guild);
  snapshot.invites.set(invite.code, {
    code: invite.code,
    inviterId: invite.inviter?.id || invite.inviterId || null,
    channelId: invite.channel?.id || invite.channelId || null,
    uses: Number(invite.uses || 0),
    maxUses: invite.maxUses ?? null,
    temporary: Boolean(invite.temporary),
    createdAt: invite.createdTimestamp ? new Date(invite.createdTimestamp).toISOString() : null
  });

  cache.set(invite.guild.id, snapshot);
  await saveSnapshot(invite.guild.id, snapshot).catch(() => null);
}

async function trackInviteDelete(invite) {
  if (!invite?.guild?.id || !invite.code) return;

  const saved = cache.get(invite.guild.id);
  if (saved) {
    saved.invites.delete(invite.code);
    cache.set(invite.guild.id, saved);
  }

  await run(
    `
    UPDATE rumi_invite_tracker_invites
    SET deleted_at = NOW(), last_seen_at = NOW()
    WHERE guild_id = ${q(invite.guild.id)}
      AND code = ${q(invite.code)}
    `,
    { guildId: invite.guild.id, inviteCode: invite.code }
  ).catch(() => null);
}

async function sendJoinLog(member, joinRow) {
  const settings = await getSettings(member.guild.id).catch(() => null);
  if (!settings?.log_channel_id) return;

  const channel = await member.guild.channels.fetch(settings.log_channel_id).catch(() => null);
  if (!channel?.send) return;

  const line = joinRow.source === 'invite'
    ? `${member.user.tag} joined using invite \`${joinRow.invite_code}\` from <@${joinRow.inviter_id}>.`
    : joinRow.source === 'vanity'
      ? `${member.user.tag} joined using the server vanity invite.`
      : `${member.user.tag} joined, but I could not identify the invite.`;

  await channel.send({
    content: line,
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function trackMemberJoin(member) {
  if (!member?.guild || member.user?.bot) return null;

  const settings = await getSettings(member.guild.id).catch(() => ({ enabled: true }));
  const previous = cache.get(member.guild.id) || await loadStoredSnapshot(member.guild.id);
  const current = await fetchSnapshot(member.guild);

  const used = detectUsedInvite(previous, current);

  await saveSnapshot(member.guild.id, current).catch(() => null);
  cache.set(member.guild.id, current);

  if (!settings.enabled) return used;

  const accountAgeMs = member.user.createdTimestamp
    ? Date.now() - member.user.createdTimestamp
    : null;

  const metadata = {
    username: member.user.username,
    tag: member.user.tag,
    displayName: member.displayName,
    inviteDetection: used
  };

  const rows = await run(
    `
    INSERT INTO rumi_invite_tracker_joins (
      guild_id,
      user_id,
      inviter_id,
      invite_code,
      source,
      joined_at,
      account_age_ms,
      member_count_snapshot,
      metadata
    )
    VALUES (
      ${q(member.guild.id)},
      ${q(member.id)},
      ${q(used.inviterId)},
      ${q(used.code)},
      ${q(used.source)},
      NOW(),
      ${q(accountAgeMs)},
      ${q(member.guild.memberCount || null)},
      ${qJson(metadata)}
    )
    RETURNING *
    `,
    { guildId: member.guild.id, userId: member.id }
  );

  const joinRow = rows[0] || {
    guild_id: member.guild.id,
    user_id: member.id,
    inviter_id: used.inviterId,
    invite_code: used.code,
    source: used.source
  };

  await sendJoinLog(member, joinRow).catch(() => null);

  return joinRow;
}

async function trackMemberLeave(member) {
  if (!member?.guild || member.user?.bot) return;

  await run(
    `
    UPDATE rumi_invite_tracker_joins
    SET left_at = NOW()
    WHERE id = (
      SELECT id
      FROM rumi_invite_tracker_joins
      WHERE guild_id = ${q(member.guild.id)}
        AND user_id = ${q(member.id)}
        AND left_at IS NULL
      ORDER BY joined_at DESC
      LIMIT 1
    )
    `,
    { guildId: member.guild.id, userId: member.id }
  ).catch(() => null);
}

function periodFilter(period, column = 'joined_at') {
  const p = String(period || 'alltime').toLowerCase();

  if (['day', 'daily', 'today', '24h'].includes(p)) {
    return `${column} >= NOW() - INTERVAL '1 day'`;
  }

  if (['week', 'weekly', '7d'].includes(p)) {
    return `${column} >= NOW() - INTERVAL '7 days'`;
  }

  if (['month', 'monthly', '30d'].includes(p)) {
    return `${column} >= NOW() - INTERVAL '30 days'`;
  }

  return 'TRUE';
}

function normalizePeriod(period) {
  const p = String(period || 'alltime').toLowerCase();

  if (['day', 'daily', 'today', '24h'].includes(p)) return 'daily';
  if (['week', 'weekly', '7d'].includes(p)) return 'weekly';
  if (['month', 'monthly', '30d'].includes(p)) return 'monthly';

  return 'alltime';
}

async function getInviter(guildId, userId) {
  return one(
    `
    SELECT *
    FROM rumi_invite_tracker_joins
    WHERE guild_id = ${q(guildId)}
      AND user_id = ${q(userId)}
    ORDER BY joined_at DESC
    LIMIT 1
    `,
    { guildId, userId }
  );
}

async function getUserInviteStats(guildId, userId, period = 'alltime') {
  const filter = periodFilter(period);

  return one(
    `
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE left_at IS NULL)::INTEGER AS active,
      COUNT(*) FILTER (WHERE left_at IS NOT NULL)::INTEGER AS left_count,
      COUNT(*) FILTER (WHERE source = 'invite')::INTEGER AS invite_joins,
      COUNT(*) FILTER (WHERE source = 'vanity')::INTEGER AS vanity_joins,
      COUNT(*) FILTER (WHERE source = 'unknown')::INTEGER AS unknown_joins
    FROM rumi_invite_tracker_joins
    WHERE guild_id = ${q(guildId)}
      AND inviter_id = ${q(userId)}
      AND ${filter}
    `,
    { guildId, userId, period }
  );
}

async function getJoinStats(guildId, period = 'alltime') {
  const filter = periodFilter(period);

  return one(
    `
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE source = 'invite')::INTEGER AS invite_joins,
      COUNT(*) FILTER (WHERE source = 'vanity')::INTEGER AS vanity_joins,
      COUNT(*) FILTER (WHERE source = 'unknown')::INTEGER AS unknown_joins,
      COUNT(*) FILTER (WHERE left_at IS NULL)::INTEGER AS active,
      COUNT(*) FILTER (WHERE left_at IS NOT NULL)::INTEGER AS left_count
    FROM rumi_invite_tracker_joins
    WHERE guild_id = ${q(guildId)}
      AND ${filter}
    `,
    { guildId, period }
  );
}

async function getVanityStats(guildId, period = 'alltime') {
  const filter = periodFilter(period);

  return one(
    `
    SELECT
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE left_at IS NULL)::INTEGER AS active,
      COUNT(*) FILTER (WHERE left_at IS NOT NULL)::INTEGER AS left_count
    FROM rumi_invite_tracker_joins
    WHERE guild_id = ${q(guildId)}
      AND source = 'vanity'
      AND ${filter}
    `,
    { guildId, period }
  );
}

async function getLeaderboard(guildId, period = 'alltime', limit = 10) {
  const filter = periodFilter(period);

  return run(
    `
    SELECT
      inviter_id,
      COUNT(*)::INTEGER AS total,
      COUNT(*) FILTER (WHERE left_at IS NULL)::INTEGER AS active,
      COUNT(*) FILTER (WHERE left_at IS NOT NULL)::INTEGER AS left_count
    FROM rumi_invite_tracker_joins
    WHERE guild_id = ${q(guildId)}
      AND inviter_id IS NOT NULL
      AND ${filter}
    GROUP BY inviter_id
    ORDER BY total DESC, active DESC
    LIMIT ${q(Math.max(1, Math.min(25, Number(limit || 10))))}
    `,
    { guildId, period }
  );
}

module.exports = {
  cache,
  getInviter,
  getJoinStats,
  getLeaderboard,
  getSettings,
  getUserInviteStats,
  getVanityStats,
  initClient,
  initGuild,
  normalizePeriod,
  trackInviteCreate,
  trackInviteDelete,
  trackMemberJoin,
  trackMemberLeave,
  updateSettings
};
