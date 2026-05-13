const { PermissionFlagsBits } = require('discord.js');
const store = require('./store');
const analytics = require('../analytics/serverAnalytics');
const db = require('../../services/database');
const { parseDurationMs } = require('./flags');

function asSeconds(value) {
  const parsed = parseDurationMs(value);
  if (parsed) return Math.floor(parsed / 1000);
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function friendlyServerLabel(config = {}, context = {}) {
  const serverId = String(config.serverId || config.server_id || '').trim();
  if (!serverId) return 'this server';
  const guild = context.client?.guilds?.cache?.get(serverId) || context.guild?.client?.guilds?.cache?.get(serverId) || null;
  const name = config.serverName || config.server_name || guild?.name || 'server';
  return `${name} (${serverId})`;
}

function conditionLabel(row, context = {}) {
  const config = row.config_json || {};
  const type = String(row.type || config.type || '').toLowerCase();
  const scope = row.scope && row.scope !== 'entry' ? ` (${row.scope})` : '';

  if (type === 'messages') return `Must have at least ${config.min || 0} messages${scope}.`;
  if (type === 'vc_time' || type === 'vc-time') return `Must have at least ${config.min || 0} voice time${scope}.`;
  if (type === 'server_age') return `Must have been in this server for ${config.min || 0}${scope}.`;
  if (type === 'account_age') return `Discord account must be at least ${config.min || 0} old${scope}.`;
  if (type === 'role') return `Must have role: <@&${config.roleId}>${scope}.`;
  if (type === 'not_role') return `Must not have role: <@&${config.roleId}>${scope}.`;
  if (type === 'boosting') return `Must be boosting this server${scope}.`;
  if (type === 'verified') return `Must have completed membership screening${scope}.`;
  if (type === 'warnings') return `Must have no more than ${config.min || 0} warning(s)${scope}.`;
  if (type === 'bans') return `Must have no more than ${config.min || 0} ban record(s)${scope}.`;
  if (type === 'mutual_server') return `Must be in server: ${friendlyServerLabel(config, context)}${scope}.`;
  if (type === 'inviter' || type === 'joined_via_invite' || type === 'invited_to_server') {
    const inviter = config.inviterId ? `<@${config.inviterId}>` : 'the required inviter';
    return `Must have joined server: ${friendlyServerLabel(config, context)} through an invite from ${inviter}${scope}.`;
  }

  return `Must pass ${type || 'this'} condition${scope}.`;
}

async function countWarnings(guildId, userId) {
  const { count } = await db.runQuery(
    db.supabase.from('warnings').select('id', { count: 'exact', head: true }).eq('guild_id', guildId).eq('user_id', userId),
    'giveaways:conditions:warnings'
  );
  return Number(count || 0);
}

async function countPunishments(guildId, userId, actionType) {
  const { count } = await db.runQuery(
    db.supabase
      .from('punishment_logs')
      .select('id', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .eq('action_type', actionType),
    'giveaways:conditions:punishments'
  );
  return Number(count || 0);
}

async function hasInviteJoin(client, member, config) {
  const serverId = String(config.serverId || config.server_id || member.guild.id);
  const inviterId = String(config.inviterId || config.inviter_id || '');
  const targetGuild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
  if (!targetGuild) return { ok: false, reason: 'Rumi is not in the required invite-tracking server.' };
  const targetMember = await targetGuild.members.fetch(member.id).catch(() => null);
  if (!targetMember) return { ok: false, reason: 'You are not in the required invite-tracking server.' };
  const botMember = targetGuild.members.me || await targetGuild.members.fetchMe().catch(() => null);
  if (!botMember?.permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    return { ok: false, reason: 'Rumi needs Manage Server to maintain invite tracking for that server.' };
  }

  const row = await store.getInviteJoin(serverId, member.id).catch(() => null);
  if (!row) return { ok: false, reason: 'Invite history is not available for your join yet.' };
  if (inviterId && row.inviter_user_id !== inviterId) {
    return { ok: false, reason: 'You did not join through the required inviter.' };
  }
  return { ok: true };
}

async function checkCondition(row, { client, guild, member, scope }) {
  const config = row.config_json || {};
  const type = String(row.type || config.type || '').toLowerCase();
  const min = Number(config.min || 0);

  if (!member) return { ok: false, reason: 'Member could not be resolved.' };

  if (type === 'messages') {
    const stats = await analytics.getGuildMemberActivity(guild.id, member.id);
    return Number(stats?.messageCount || 0) >= min
      ? { ok: true }
      : { ok: false, reason: `Requires at least ${min} messages.` };
  }

  if (type === 'vc_time' || type === 'vc-time') {
    const stats = await analytics.getGuildMemberActivity(guild.id, member.id);
    const required = asSeconds(config.min || min);
    return Number(stats?.voiceSecondsTotal || 0) >= required
      ? { ok: true }
      : { ok: false, reason: `Requires at least ${config.min || required} of VC time.` };
  }

  if (type === 'server_age') {
    const required = asSeconds(config.min || min);
    const age = Math.floor((Date.now() - Number(member.joinedTimestamp || Date.now())) / 1000);
    return age >= required ? { ok: true } : { ok: false, reason: `Requires server age of ${config.min || required}s.` };
  }

  if (type === 'account_age') {
    const required = asSeconds(config.min || min);
    const age = Math.floor((Date.now() - Number(member.user.createdTimestamp || Date.now())) / 1000);
    return age >= required ? { ok: true } : { ok: false, reason: `Requires account age of ${config.min || required}s.` };
  }

  if (type === 'role') {
    return member.roles.cache.has(config.roleId)
      ? { ok: true }
      : { ok: false, reason: `Requires <@&${config.roleId}>.` };
  }

  if (type === 'not_role') {
    return !member.roles.cache.has(config.roleId)
      ? { ok: true }
      : { ok: false, reason: `Members with <@&${config.roleId}> are blocked.` };
  }

  if (type === 'boosting') {
    return member.premiumSinceTimestamp ? { ok: true } : { ok: false, reason: 'Requires an active server boost.' };
  }

  if (type === 'verified') {
    return member.pending === false ? { ok: true } : { ok: false, reason: 'Requires completed Discord membership screening.' };
  }

  if (type === 'warnings') {
    const count = await countWarnings(guild.id, member.id).catch(() => 0);
    return count <= min ? { ok: true } : { ok: false, reason: `Requires no more than ${min} warning(s).` };
  }

  if (type === 'bans') {
    const count = await countPunishments(guild.id, member.id, 'ban').catch(() => 0);
    return count <= min ? { ok: true } : { ok: false, reason: `Requires no more than ${min} ban record(s).` };
  }

  if (type === 'mutual_server') {
    const serverId = String(config.serverId || config.server_id || '');
    const targetGuild = client.guilds.cache.get(serverId) || await client.guilds.fetch(serverId).catch(() => null);
    if (!targetGuild) return { ok: false, reason: 'Rumi is not in the required mutual server.' };
    const targetMember = await targetGuild.members.fetch(member.id).catch(() => null);
    return targetMember ? { ok: true } : { ok: false, reason: 'Requires membership in the configured mutual server.' };
  }

  if (type === 'inviter' || type === 'joined_via_invite' || type === 'invited_to_server') {
    return hasInviteJoin(client, member, config);
  }

  return {
    ok: false,
    reason: `${type || 'That'} condition is configured but not available in this server yet.`
  };
}

async function checkEligibility(giveaway, member, scope, client) {
  const rows = await store.listConditions(giveaway.id, scope);
  for (const row of rows) {
    const result = await checkCondition(row, { client, guild: member.guild, member, scope });
    if (!result.ok) return result;
  }
  return { ok: true };
}

async function calculateBonusEntries(giveaway, member) {
  const rows = await store.listBonusRules(giveaway.id);
  let bonus = 0;

  for (const row of rows) {
    const config = row.config_json || {};
    const type = String(row.type || config.type || '').toLowerCase();
    const entries = Math.max(0, Number(row.entries || config.entries || 0));

    if (type === 'role' && member.roles.cache.has(config.roleId)) bonus += entries;
    if (type === 'booster' && member.premiumSinceTimestamp) bonus += entries;
    if (type === 'messages') {
      const stats = await analytics.getGuildMemberActivity(member.guild.id, member.id).catch(() => null);
      if (Number(stats?.messageCount || 0) >= Number(config.messages || config.min || 0)) bonus += entries;
    }
    if (type === 'vc_time' || type === 'vc-time') {
      const stats = await analytics.getGuildMemberActivity(member.guild.id, member.id).catch(() => null);
      if (Number(stats?.voiceSecondsTotal || 0) >= asSeconds(config.vcTime || config.min || 0)) bonus += entries;
    }
  }

  return bonus;
}

module.exports = {
  checkEligibility,
  calculateBonusEntries,
  conditionLabel
};
