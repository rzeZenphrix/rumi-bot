const db = require('../../services/database');
const logger = require('../logging/logger');
const { probeFakePermission } = require('../permissions/fakePermissions');
const { jailMember } = require('../jail/jailManager');
const { getProtectionSettings, isSecuritySystemEnabled } = require('../security/protectionConfig');

const DEFAULT_AUTOJAIL = Object.freeze({
  enabled: false,
  mode: 'join',
  intervalMinutes: 60,
  accountAgeDays: 0,
  noAvatar: false,
  keywords: [],
  scanUsername: true,
  scanDisplayName: true,
  scanGlobalName: true,
  nsfwAvatarPremium: false,
  lastRunAt: null
});

function normalizeKeywords(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean))].slice(0, 50);
}

function normalizeAutoJailConfig(value = {}) {
  const interval = Number(value.intervalMinutes);
  const age = Number(value.accountAgeDays);
  return {
    ...DEFAULT_AUTOJAIL,
    ...(value || {}),
    enabled: value?.enabled === true,
    mode: value?.mode === 'scheduled' ? 'scheduled' : 'join',
    intervalMinutes: Number.isFinite(interval) && interval > 0 ? Math.min(1440, Math.round(interval)) : DEFAULT_AUTOJAIL.intervalMinutes,
    accountAgeDays: Number.isFinite(age) && age > 0 ? Math.min(3650, Math.round(age)) : 0,
    noAvatar: value?.noAvatar === true,
    keywords: normalizeKeywords(value?.keywords),
    scanUsername: value?.scanUsername !== false,
    scanDisplayName: value?.scanDisplayName !== false,
    scanGlobalName: value?.scanGlobalName !== false,
    nsfwAvatarPremium: value?.nsfwAvatarPremium === true,
    lastRunAt: value?.lastRunAt || null
  };
}

async function getAutoJailConfig(guildId) {
  const row = await db.getGuildSettings(guildId);
  return normalizeAutoJailConfig(row.settings_json?.autojail || {});
}

async function updateAutoJailConfig(guildId, updater) {
  const row = await db.getGuildSettings(guildId);
  const settings = { ...(row.settings_json || {}) };
  const current = normalizeAutoJailConfig(settings.autojail || {});
  const next = normalizeAutoJailConfig(typeof updater === 'function' ? updater(current) : updater);
  settings.autojail = next;
  await db.updateGuildSettings(guildId, { settings_json: settings });
  return next;
}

async function shouldBypass(member) {
  if (!member || member.user?.bot) return true;
  if (member.id === member.guild.ownerId) return true;
  if (await db.isWhitelisted(member.guild.id, member.id).catch(() => false)) return true;
  const generalBypass = await probeFakePermission(member.guild.id, member, 'RumiBypass');
  const specificBypass = await probeFakePermission(member.guild.id, member, 'RumiBypassAutojail');
  if (!generalBypass.ok || !specificBypass.ok) return true;
  if (generalBypass.value || specificBypass.value) return true;
  if (member.permissions?.has?.('Administrator')) return true;
  return false;
}

function evaluateMember(member, config) {
  const reasons = [];

  if (config.accountAgeDays > 0) {
    const ageDays = (Date.now() - Number(member.user?.createdTimestamp || 0)) / 86400000;
    if (ageDays < config.accountAgeDays) {
      reasons.push(`account younger than ${config.accountAgeDays} day(s)`);
    }
  }

  if (config.noAvatar && !member.user?.avatar) {
    reasons.push('no profile picture');
  }

  if (config.keywords.length) {
    const textParts = [];
    if (config.scanUsername) textParts.push(member.user?.username || '');
    if (config.scanGlobalName) textParts.push(member.user?.globalName || '');
    if (config.scanDisplayName) textParts.push(member.displayName || '');
    const haystack = textParts.join(' ').toLowerCase();
    const hits = config.keywords.filter((keyword) => haystack.includes(keyword));
    if (hits.length) {
      reasons.push(`matched keyword(s): ${hits.join(', ')}`);
    }
  }

  return reasons;
}

async function maybeAutoJailMember(member, mode = 'join') {
  const protection = await getProtectionSettings(member.guild.id).catch(() => null);
  if (!protection || !isSecuritySystemEnabled(protection, 'autojail', protection.row?.jail_enabled !== false)) return { ok: false, skipped: 'disabled' };

  const config = normalizeAutoJailConfig(protection.row?.settings_json?.autojail || {});
  if (!config.enabled || config.mode !== mode) return { ok: false, skipped: 'mode' };
  if (await shouldBypass(member)) return { ok: false, skipped: 'bypass' };

  const reasons = evaluateMember(member, config);
  if (!reasons.length) return { ok: false, skipped: 'clean' };

  const result = await jailMember({
    guild: member.guild,
    member,
    reason: `AutoJail: ${reasons.join('; ')}`,
    metadata: {
      source: `autojail_${mode}`,
      reasons
    }
  }).catch((error) => ({ ok: false, error, reason: error?.message || 'unknown error' }));

  return {
    ...result,
    reasons,
    config
  };
}

async function runScheduledAutoJailScan(client) {
  for (const guild of client.guilds.cache.values()) {
    const protection = await getProtectionSettings(guild.id).catch(() => null);
    if (!protection || !isSecuritySystemEnabled(protection, 'autojail', protection.row?.jail_enabled !== false)) continue;

    const config = normalizeAutoJailConfig(protection.row?.settings_json?.autojail || {});
    if (!config.enabled || config.mode !== 'scheduled') continue;

    const lastRun = config.lastRunAt ? new Date(config.lastRunAt).getTime() : 0;
    const intervalMs = config.intervalMinutes * 60000;
    if (lastRun && Date.now() - lastRun < intervalMs) continue;

    const members = await guild.members.fetch().catch(() => null);
    if (!members) continue;

    let matched = 0;
    for (const member of members.values()) {
      const result = await maybeAutoJailMember(member, 'scheduled').catch(() => ({ ok: false }));
      if (result?.ok || result?.alreadyJailed) matched += 1;
    }

    await updateAutoJailConfig(guild.id, (current) => ({
      ...current,
      lastRunAt: new Date().toISOString()
    })).catch((error) => {
      logger.warn({ error, guildId: guild.id }, 'Failed to update autojail scheduled run timestamp');
    });

    if (matched > 0) {
      logger.info({ guildId: guild.id, matched }, 'AutoJail scheduled scan matched members');
    }
  }
}

function startAutoJailScheduler(client) {
  const intervalMs = Math.max(60000, Number(process.env.AUTOJAIL_SCAN_INTERVAL_MS || 300000));
  const tick = () => {
    runScheduledAutoJailScan(client).catch((error) => {
      logger.warn({ error }, 'AutoJail scheduled scan failed');
    });
  };
  setInterval(tick, intervalMs).unref?.();
}

module.exports = {
  DEFAULT_AUTOJAIL,
  normalizeAutoJailConfig,
  getAutoJailConfig,
  updateAutoJailConfig,
  maybeAutoJailMember,
  runScheduledAutoJailScan,
  startAutoJailScheduler
};
