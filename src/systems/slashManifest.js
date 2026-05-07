const CURATED_SLASH_COMMANDS = Object.freeze([
  'help',
  'ping',
  'dashboard',
  'prefix',
  'premium',
  'serverpremium',
  'userpremium',
  'ticket',
  'giveaway',
  'spotify',
  'lastfm',
  'music',
  'verification',
  'security',
  'setup',
  'commandnotfound',
  'variables',
  'messagecount',
  'voicecount',
  'support',
  'invite',
  'about',
  'shard'
]);

const LEGACY_SLASH_COMMANDS = Object.freeze([
  ...CURATED_SLASH_COMMANDS,
  'automod',
  'autojail',
  'ban',
  'currency',
  'economy',
  'fakeperm',
  'kick',
  'mute',
  'nsfw',
  'purge',
  'role',
  'softban',
  'tempban',
  'unban',
  'unmute',
  'warn'
]);

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function strictManifestEnabled() {
  return envFlag('SLASH_SYNC_STRICT_MANIFEST', true);
}

function configuredSlashCommands() {
  const raw = String(process.env.SLASH_SYNC_COMMANDS || '').trim();
  const base = raw
    ? raw.split(',').map((name) => name.trim().toLowerCase()).filter(Boolean)
    : (strictManifestEnabled() ? CURATED_SLASH_COMMANDS : LEGACY_SLASH_COMMANDS);

  return [...new Set(base)];
}

function musicSlashOwnedBySidecar() {
  const raw = String(process.env.MUSIC_SLASH_OWNER || '').trim().toLowerCase();
  return raw === 'sidecar' || raw === 'music-service' || raw === 'java';
}

function isSlashSupported(commandName) {
  const normalized = String(commandName || '').toLowerCase();
  if (musicSlashOwnedBySidecar() && (normalized === 'music' || normalized === 'spotify')) {
    return false;
  }
  return configuredSlashCommands().includes(normalized);
}

function listSupportedSlashCommands() {
  const commands = configuredSlashCommands();
  if (!musicSlashOwnedBySidecar()) {
    return commands;
  }
  return commands.filter((name) => name !== 'music' && name !== 'spotify');
}

module.exports = {
  SUPPORTED_SLASH_COMMANDS: CURATED_SLASH_COMMANDS,
  CURATED_SLASH_COMMANDS,
  LEGACY_SLASH_COMMANDS,
  musicSlashOwnedBySidecar,
  isSlashSupported,
  listSupportedSlashCommands
};
