const SUPPORTED_SLASH_COMMANDS = Object.freeze([
  'about',
  'ask',
  'autojail',
  'automod',
  'ban',
  'bookmark',
  'calculator',
  'calendar',
  'case',
  'channelinfo',
  'changelog',
  'claim',
  'close',
  'color',
  'config',
  'crypto',
  'currency',
  'customcommand',
  'customize',
  'dashboard',
  'deafen',
  'define',
  'deposit',
  'disconnect',
  'domain',
  'economy',
  'economytop',
  'emojiinfo',
  'expandurl',
  'fakeperm',
  'fn',
  'give',
  'hardban',
  'help',
  'hide',
  'history',
  'id',
  'inventory',
  'invite',
  'iplookup',
  'kick',
  'linkpreview',
  'lock',
  'lockdown',
  'music',
  'mute',
  'nuke',
  'nsfw',
  'ping',
  'prefix',
  'premium',
  'presence',
  'purge',
  'reactionrole',
  'regex',
  'reminder',
  'role',
  'roleinfo',
  'rumishop',
  'savegif',
  'security',
  'selfprefix',
  'sell',
  'serverpremium',
  'setup',
  'shard',
  'shop',
  'slowmode',
  'softban',
  'spotify',
  'support',
  'tempban',
  'thresholds',
  'ticket',
  'todo',
  'transcript',
  'translate',
  'unban',
  'undeafen',
  'unhide',
  'unlock',
  'unlockdown',
  'unmute',
  'userpremium',
  'userinfo',
  'variables',
  'voicemove',
  'vote',
  'warn',
  'weather',
  'weekly',
  'whitelist',
  'withdraw',
  'work',
  'balance',
  'buy',
  'daily'
]);

const supportedSet = new Set(SUPPORTED_SLASH_COMMANDS);

function musicSlashOwnedBySidecar() {
  const raw = String(process.env.MUSIC_SLASH_OWNER || '').trim().toLowerCase();
  return raw === 'sidecar' || raw === 'music-service' || raw === 'java';
}

function isSlashSupported(commandName) {
  const normalized = String(commandName || '').toLowerCase();
  if (musicSlashOwnedBySidecar() && (normalized === 'music' || normalized === 'spotify')) {
    return false;
  }
  return supportedSet.has(normalized);
}

function listSupportedSlashCommands() {
  if (!musicSlashOwnedBySidecar()) {
    return [...SUPPORTED_SLASH_COMMANDS];
  }
  return SUPPORTED_SLASH_COMMANDS.filter((name) => name !== 'music' && name !== 'spotify');
}

module.exports = {
  SUPPORTED_SLASH_COMMANDS,
  musicSlashOwnedBySidecar,
  isSlashSupported,
  listSupportedSlashCommands
};
