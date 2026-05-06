const {
  getProtectionSettings,
  updateProtectionSection
} = require('./protectionConfig');
const { normalizeAntinukeConfig } = require('../antinuke/config');

function normalizeTrustNobody(value = {}) {
  return {
    enabled: value?.enabled === true,
    overboundPercent: Math.min(500, Math.max(0, Math.round(Number(value?.overboundPercent ?? 75)))),

    includeTrustedUsers: value?.includeTrustedUsers !== false,
    includeTrustedRoles: value?.includeTrustedRoles !== false,
    includeTrustedBots: value?.includeTrustedBots !== false,
    includeWhitelist: value?.includeWhitelist !== false,
    includeAntinukeAdmins: value?.includeAntinukeAdmins !== false,
    includeFakePermissionBypass: value?.includeFakePermissionBypass !== false,

    action: ['alert', 'mitigate'].includes(String(value?.action || '').toLowerCase())
      ? String(value.action).toLowerCase()
      : 'mitigate'
  };
}

async function getTrustNobodySettings(guildId) {
  const protection = await getProtectionSettings(guildId);
  const antinuke = normalizeAntinukeConfig(protection.antinuke || {});

  return normalizeTrustNobody(antinuke.trustNoOne || antinuke.trustNobody || {});
}

async function updateTrustNobodySettings(guildId, updater) {
  return updateProtectionSection(guildId, 'antinuke', (current) => {
    const antinuke = normalizeAntinukeConfig(current || {});
    const currentTrustNoOne = normalizeTrustNobody(antinuke.trustNoOne || {});
    const nextTrustNoOne = typeof updater === 'function'
      ? updater(currentTrustNoOne)
      : updater;

    return normalizeAntinukeConfig({
      ...antinuke,
      trustNoOne: normalizeTrustNobody(nextTrustNoOne)
    });
  });
}

function trustedReasonWatched(reason, settings = {}) {
  if (!settings.enabled) return false;

  if (reason === 'trusted_user') return settings.includeTrustedUsers !== false;
  if (reason === 'trusted_role') return settings.includeTrustedRoles !== false;
  if (reason === 'trusted_bot') return settings.includeTrustedBots !== false;
  if (reason === 'legacy_whitelist' || reason === 'global_whitelist') return settings.includeWhitelist !== false;
  if (reason === 'antinuke_admin') return settings.includeAntinukeAdmins !== false;
  if (reason === 'fake_permission') return settings.includeFakePermissionBypass !== false;

  return false;
}

function applyOverbound(value, percent) {
  const base = Number(value || 0);
  const overbound = Math.max(0, Number(percent || 0));

  return Math.max(1, Math.ceil(base * (1 + overbound / 100)));
}

module.exports = {
  normalizeTrustNobody,
  getTrustNobodySettings,
  updateTrustNobodySettings,
  trustedReasonWatched,
  applyOverbound
};