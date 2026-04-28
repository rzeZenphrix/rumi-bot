const { PermissionFlagsBits } = require('discord.js');
const { DEFAULT_PREFIX } = require('../../systems/prefix/prefixManager');
const { isSlashSupported } = require('../../systems/slashManifest');

const PERMISSION_LABELS = {
  AddReactions: 'Add Reactions',
  Administrator: 'Administrator',
  AttachFiles: 'Attach Files',
  BanMembers: 'Ban Members',
  ChangeNickname: 'Change Nickname',
  Connect: 'Connect',
  CreateEvents: 'Create Events',
  CreateGuildExpressions: 'Create Server Expressions',
  CreateInstantInvite: 'Create Invite',
  CreatePrivateThreads: 'Create Private Threads',
  CreatePublicThreads: 'Create Public Threads',
  DeafenMembers: 'Deafen Members',
  EmbedLinks: 'Embed Links',
  KickMembers: 'Kick Members',
  ManageChannels: 'Manage Channels',
  ManageEvents: 'Manage Events',
  ManageGuild: 'Manage Server',
  ManageGuildExpressions: 'Manage Server Expressions',
  ManageMessages: 'Manage Messages',
  ManageNicknames: 'Manage Nicknames',
  ManageRoles: 'Manage Roles',
  ManageThreads: 'Manage Threads',
  ManageWebhooks: 'Manage Webhooks',
  MentionEveryone: 'Mention Everyone',
  ModerateMembers: 'Timeout Members',
  MoveMembers: 'Move Members',
  MuteMembers: 'Mute Members',
  ReadMessageHistory: 'Read Message History',
  RequestToSpeak: 'Request To Speak',
  SendMessages: 'Send Messages',
  SendMessagesInThreads: 'Send Messages In Threads',
  SendTTSMessages: 'Send TTS Messages',
  Speak: 'Speak',
  Stream: 'Video',
  UseApplicationCommands: 'Use Application Commands',
  UseEmbeddedActivities: 'Use Activities',
  UseExternalEmojis: 'Use External Emojis',
  UseExternalSounds: 'Use External Sounds',
  UseExternalStickers: 'Use External Stickers',
  UseSoundboard: 'Use Soundboard',
  UseVAD: 'Use Voice Activity',
  ViewAuditLog: 'View Audit Log',
  ViewChannel: 'View Channel',
  ViewCreatorMonetizationAnalytics: 'View Monetization Analytics',
  ViewGuildInsights: 'View Server Insights'
};

function formatPermissionKey(key) {
  return PERMISSION_LABELS[key] || String(key).replace(/([a-z])([A-Z])/g, '$1 $2');
}

function permissionToNames(permission) {
  if (!permission) return [];

  if (typeof permission === 'string' && !/^\d+$/.test(permission)) {
    return [PERMISSION_LABELS[permission] || permission];
  }

  let value;
  try {
    value = BigInt(permission.toString());
  } catch {
    return [String(permission)];
  }

  const exact = Object.entries(PermissionFlagsBits).find(([, flag]) => BigInt(flag) === value);
  if (exact) return [formatPermissionKey(exact[0])];

  const names = Object.entries(PermissionFlagsBits)
    .filter(([, flag]) => {
      const bigFlag = BigInt(flag);
      return bigFlag !== 0n && (value & bigFlag) === bigFlag;
    })
    .map(([key]) => formatPermissionKey(key));

  return names.length ? names : [permission.toString()];
}

function unique(list = []) {
  return [...new Set((list || []).map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeUsage(value, fallback = '') {
  return String(value || fallback || '').replace(/^[/,!.?]/, '').trim();
}

function deriveParametersFromUsage(usage, fullName) {
  const normalizedUsage = normalizeUsage(usage, fullName);
  const normalizedName = normalizeUsage(fullName, fullName);
  const stripped = normalizedUsage.startsWith(normalizedName)
    ? normalizedUsage.slice(normalizedName.length).trim()
    : normalizedUsage;
  return stripped || 'n/a';
}

function deriveExamples(prefix, examples = [], fallbackUsage = '') {
  if (!Array.isArray(examples) || !examples.length) {
    return fallbackUsage ? [`${prefix}${normalizeUsage(fallbackUsage, '')}`] : [];
  }
  return examples.map((example) => `${prefix}${normalizeUsage(example, fallbackUsage)}`);
}

function deriveFlags(source = {}) {
  if (Array.isArray(source.flags)) return unique(source.flags);
  return [];
}

function premiumLabel(premium) {
  if (!premium) return null;
  if (premium === true) return 'Premium';
  if (typeof premium === 'string') return premium;

  const scope = String(premium.scope || '').toLowerCase();
  const tier = String(premium.tier || 'base').toLowerCase();

  if (scope === 'user') return 'User Premium';
  if (scope === 'shared') return 'User Premium or Server Premium';
  if (scope === 'server') {
    if (tier === 'tier1') return 'Server Premium Tier 1';
    if (tier === 'tier2') return 'Server Premium Tier 2';
    if (tier === 'tier3') return 'Server Premium Tier 3';
    return 'Server Premium';
  }

  return 'Premium';
}

function slashSupportLabel(source = {}, commandName = '') {
  if (source?.slash?.supported === false) return 'Prefix only';
  if (source?.slash?.supported === true || source?.slash === true || isSlashSupported(commandName)) {
    return 'Prefix + slash';
  }
  return 'Prefix only';
}

function deriveInformation(source, commandCategory, permissions, botPermissions, commandName) {
  const parts = [];
  if (permissions.length) parts.push(permissions.join(', '));
  if (source.premium) parts.push(premiumLabel(source.premium));
  if (source.nsfw) parts.push('NSFW');
  parts.push(slashSupportLabel(source, commandName));
  if (botPermissions.length) parts.push(`Bot: ${botPermissions.join(', ')}`);
  if (source.guildOnly) parts.push('Guild only');
  if (commandCategory) parts.push(`Module ${String(commandCategory).toLowerCase()}`);
  return parts.join(' • ') || 'n/a';
}

function serializeEntry(command, prefix, sub = null) {
  const fullName = sub ? `${command.name} ${sub.name}` : command.name;
  const permissions = Array.isArray(command.permissions)
    ? command.permissions.flatMap(permissionToNames).filter(Boolean)
    : [];
  const botPermissions = Array.isArray(command.botPermissions)
    ? command.botPermissions.flatMap(permissionToNames).filter(Boolean)
    : [];
  const rawUsage = normalizeUsage(sub?.usage || command.usage || fullName, fullName);
  const usage = sub && rawUsage && !rawUsage.toLowerCase().startsWith(fullName.toLowerCase())
    ? `${fullName} ${rawUsage}`
    : rawUsage;
  const examples = deriveExamples(prefix, sub?.examples || command.examples, usage);
  const slashSupported = (sub?.slash?.supported ?? command?.slash?.supported) === false
    ? false
    : isSlashSupported(command.name) ||
      command?.slash?.supported === true ||
      command?.slash === true ||
      sub?.slash?.supported === true;

  return {
    id: fullName.toLowerCase().replace(/\s+/g, ':'),
    parent: sub ? command.name : null,
    type: sub ? 'subcommand' : 'command',
    name: sub?.name || command.name,
    fullName,
    prefix,
    aliases: unique(sub?.aliases || command.aliases),
    category: command.category || 'misc',
    module: command.category || 'misc',
    description: sub?.description || command.description || 'No description provided.',
    usage,
    parameters: deriveParametersFromUsage(usage, fullName),
    examples,
    example: examples[0] || `${prefix}${fullName}`,
    permissions,
    botPermissions,
    flags: deriveFlags(sub || command),
    premium: Boolean(sub?.premium ?? command.premium),
    premiumRequirement: sub?.premium ?? command.premium ?? null,
    premiumLabel: premiumLabel(sub?.premium ?? command.premium ?? null),
    nsfw: Boolean(sub?.nsfw ?? command.nsfw),
    slashSupported,
    slashLabel: slashSupported ? 'Prefix + slash' : 'Prefix only',
    information: deriveInformation(sub || command, command.category, permissions, botPermissions, command.name)
  };
}

function serializeSubcommands(command, prefix) {
  if (!Array.isArray(command.subcommands)) return [];
  return command.subcommands.map((sub) => serializeEntry(command, prefix, sub));
}

function serializeCommand(command, prefix = DEFAULT_PREFIX) {
  const entry = serializeEntry(command, prefix);
  return {
    ...entry,
    subcommands: serializeSubcommands(command, prefix)
  };
}

function getCommandCatalog(client, prefix = DEFAULT_PREFIX) {
  const uniqueCommands = new Map();

  for (const command of client.commands.values()) {
    if (!command?.name) continue;
    uniqueCommands.set(command.name, serializeCommand(command, prefix));
  }

  const commands = [...uniqueCommands.values()].sort((a, b) => a.name.localeCompare(b.name));
  const entries = commands
    .flatMap((command) => {
      const { subcommands, ...base } = command;
      return [base, ...(subcommands || [])];
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return {
    prefix,
    commands,
    entries,
    count: entries.length,
    commandCount: commands.length,
    source: 'rumi-bot-runtime',
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  getCommandCatalog,
  serializeCommand,
  serializeEntry
};
