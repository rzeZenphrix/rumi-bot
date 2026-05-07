const { PermissionFlagsBits } = require('discord.js');
const { DEFAULT_PREFIX } = require('../../systems/prefix/prefixManager');
const { isSlashSupported } = require('../../systems/slashManifest');
const { buildMusicAliasEntries } = require('../../systems/music/musicAliases');
const {
  getRawUsageLines,
  getRawExampleLines,
  prefixLine,
  buildUsageText,
  stripLeadingPrefix
} = require('../../utils/commandUsage');

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

const CATEGORY_ALIASES = Object.freeze({
  admin: 'configuration',
  config: 'configuration',
  configs: 'configuration',
  core: 'core',
  general: 'utility',
  guild: 'server',
  giveaway: 'giveaways',
  info: 'utility',
  lastfm: 'lastfm',
  moderation: 'moderation',
  mod: 'moderation',
  music: 'music',
  permission: 'role',
  permissions: 'role',
  server: 'server',
  social: 'roleplay',
  staff: 'moderation',
  tools: 'utility',
  util: 'utility',
  vc: 'voice',
  voice: 'voice'
});

function normalizeCategory(category) {
  const raw = String(category || 'misc').trim().toLowerCase();
  return CATEGORY_ALIASES[raw] || raw || 'misc';
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

  if (
    source?.slash?.supported === true ||
    source?.slash === true ||
    isSlashSupported(commandName)
  ) {
    return 'Prefix + slash';
  }

  return 'Prefix only';
}

function deriveInformation(source, commandCategory, permissions, botPermissions, commandName) {
  const parts = [];

  if (permissions.length) parts.push(`User: ${permissions.join(', ')}`);
  if (source.premium) parts.push(premiumLabel(source.premium));
  if (source.nsfw) parts.push('NSFW');

  parts.push(slashSupportLabel(source, commandName));

  if (botPermissions.length) parts.push(`Bot: ${botPermissions.join(', ')}`);
  if (source.guildOnly) parts.push('Guild only');
  if (source.ownerOnly) parts.push('Owner only');
  if (commandCategory) parts.push(`Module ${String(commandCategory).toLowerCase()}`);

  return parts.join(' • ') || 'n/a';
}

function firstLine(lines, fallback) {
  return lines.find(Boolean) || fallback;
}

function deriveParametersFromUsage(usage, fullName) {
  const normalizedUsage = stripLeadingPrefix(usage || fullName);
  const normalizedName = stripLeadingPrefix(fullName || '');

  const stripped = normalizedUsage.toLowerCase().startsWith(normalizedName.toLowerCase())
    ? normalizedUsage.slice(normalizedName.length).trim()
    : normalizedUsage;

  return stripped || 'n/a';
}

function resolveUsageLines(source, fullName) {
  const lines = getRawUsageLines(source);
  return lines.length ? lines : [fullName];
}

function resolveExampleLines(source, usageLines) {
  const lines = getRawExampleLines(source);
  return lines.length ? lines : usageLines;
}

function prefixedExamples(prefix, lines) {
  return lines.map((line) => prefixLine(prefix, line)).filter(Boolean);
}

function serializeEntry(command, prefix, sub = null) {
  const source = sub || command;
  const fullName = sub ? `${command.name} ${sub.name}` : command.name;
  const category = normalizeCategory(command.category || 'misc');

  const permissions = Array.isArray(command.permissions)
    ? command.permissions.flatMap(permissionToNames).filter(Boolean)
    : [];

  const botPermissions = Array.isArray(command.botPermissions)
    ? command.botPermissions.flatMap(permissionToNames).filter(Boolean)
    : [];

  const usageLines = resolveUsageLines(source, fullName);
  const exampleLines = resolveExampleLines(source, usageLines);
  const examples = prefixedExamples(prefix, exampleLines);
  const slashSupported = (sub?.slash?.supported ?? command?.slash?.supported) === false
    ? false
    : isSlashSupported(command.name) ||
      command?.slash?.supported === true ||
      command?.slash === true ||
      sub?.slash?.supported === true;

  const premiumRequirement = sub?.premium ?? command.premium ?? null;

  const entry = {
    id: fullName.toLowerCase().replace(/\s+/g, ':'),
    parent: sub ? command.name : null,
    type: sub ? 'subcommand' : 'command',
    name: sub?.name || command.name,
    fullName,
    prefix,
    aliases: unique(sub?.aliases || command.aliases),
    category,
    module: category,
    description: sub?.description || command.description || 'No description provided.',
    usage: firstLine(usageLines, fullName),
    usageLines,
    parameters: deriveParametersFromUsage(firstLine(usageLines, fullName), fullName),
    examples,
    exampleLines,
    example: examples[0] || `${prefix}${fullName}`,
    permissions,
    botPermissions,
    flags: deriveFlags(source),
    premium: Boolean(premiumRequirement),
    premiumRequirement,
    premiumLabel: premiumLabel(premiumRequirement),
    nsfw: Boolean(sub?.nsfw ?? command.nsfw),
    hidden: Boolean(sub?.hidden ?? command.hidden),
    ownerOnly: Boolean(sub?.ownerOnly ?? command.ownerOnly),
    guildOnly: Boolean(sub?.guildOnly ?? command.guildOnly),
    slashSupported,
    slashLabel: slashSupported ? 'Prefix + slash' : 'Prefix only'
  };

  entry.information = deriveInformation(entry, category, permissions, botPermissions, command.name);
  entry.renderedUsage = buildUsageText(entry, prefix);

  return entry;
}

function serializeVirtualEntry(registryEntry, prefix) {
  const source = registryEntry.source || registryEntry;
  const fullName = registryEntry.fullName || source.fullName || source.name;
  const category = normalizeCategory(registryEntry.category || source.category || 'misc');

  const permissions = Array.isArray(source.permissions)
    ? source.permissions.flatMap(permissionToNames).filter(Boolean)
    : [];

  const botPermissions = Array.isArray(source.botPermissions)
    ? source.botPermissions.flatMap(permissionToNames).filter(Boolean)
    : [];

  const usageLines = resolveUsageLines(source, fullName);
  const exampleLines = resolveExampleLines(source, usageLines);
  const examples = prefixedExamples(prefix, exampleLines);
  const premiumRequirement = source.premium ?? null;
  const commandName = registryEntry.sourceCommandName || registryEntry.parent || registryEntry.name;

  const slashSupported = source?.slash?.supported === false
    ? false
    : source?.slash?.supported === true ||
      source?.slash === true ||
      isSlashSupported(commandName);

  const entry = {
    id: registryEntry.id || fullName.toLowerCase().replace(/\s+/g, ':'),
    parent: registryEntry.parent || source.parent || null,
    type: registryEntry.type || source.type || 'virtual',
    name: registryEntry.name || source.name || fullName,
    fullName,
    prefix,
    aliases: unique(source.aliases || []),
    category,
    module: registryEntry.module || source.module || category,
    description: source.description || 'No description provided.',
    usage: firstLine(usageLines, fullName),
    usageLines,
    parameters: deriveParametersFromUsage(firstLine(usageLines, fullName), fullName),
    examples,
    exampleLines,
    example: examples[0] || `${prefix}${fullName}`,
    permissions,
    botPermissions,
    flags: deriveFlags(source),
    premium: Boolean(premiumRequirement),
    premiumRequirement,
    premiumLabel: premiumLabel(premiumRequirement),
    nsfw: Boolean(source.nsfw),
    hidden: Boolean(source.hidden),
    ownerOnly: Boolean(source.ownerOnly),
    guildOnly: Boolean(source.guildOnly),
    slashSupported,
    slashLabel: slashSupported ? 'Prefix + slash' : 'Prefix only'
  };

  entry.information = deriveInformation(entry, category, permissions, botPermissions, commandName);
  entry.renderedUsage = buildUsageText(entry, prefix);

  return entry;
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

function fallbackUniqueCommands(client) {
  const uniqueCommands = new Map();

  for (const command of client.commands?.values?.() || []) {
    if (!command?.name) continue;
    uniqueCommands.set(command.name, command);
  }

  return [...uniqueCommands.values()];
}

function serializeRegistryEntries(client, prefix, options = {}) {
  const registry = client.commandRegistry;

  if (!registry?.getPublicEntries) {
    const commands = fallbackUniqueCommands(client).map((command) => serializeCommand(command, prefix));

    const entries = commands.flatMap((command) => {
      const { subcommands, ...base } = command;
      return [base, ...(subcommands || [])];
    });

    return { commands, entries };
  }

  const commands = registry
    .getCommands()
    .filter((command) => {
      if (!options.includeHidden && command.hidden) return false;
      if (!options.includeOwnerOnly && command.ownerOnly) return false;
      return true;
    })
    .map((command) => serializeCommand(command, prefix))
    .sort((a, b) => a.name.localeCompare(b.name));

  const entries = registry
    .getPublicEntries(options)
    .map((entry) => {
      if (entry.type === 'command') return serializeEntry(entry.command, prefix);
      if (entry.type === 'subcommand') return serializeEntry(entry.command, prefix, entry.subcommand);
      return serializeVirtualEntry(entry, prefix);
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  return { commands, entries };
}

function getCommandCatalog(client, prefix = DEFAULT_PREFIX, options = {}) {
  const { commands, entries } = serializeRegistryEntries(client, prefix, options);
  const musicAliases = options.includeMusicAliases === true ? buildMusicAliasEntries(prefix) : [];
  const dedupedEntries = new Map();

  for (const entry of entries.concat(musicAliases)) {
    const key = `${String(entry.type || 'command').toLowerCase()}:${String(entry.fullName || entry.name || '').toLowerCase()}`;
    const existing = dedupedEntries.get(key);

    if (!existing || (existing.virtual && !entry.virtual)) {
      dedupedEntries.set(key, entry);
    }
  }

  const allEntries = [...dedupedEntries.values()]
    .filter((entry) => {
      if (!options.includeHidden && entry.hidden) return false;
      if (!options.includeOwnerOnly && entry.ownerOnly) return false;
      return true;
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  const counts = {
    total: allEntries.length,
    base: commands.length,
    subcommands: allEntries.filter((entry) => entry.type === 'subcommand').length,
    virtual: allEntries.filter((entry) => !['command', 'subcommand'].includes(entry.type)).length,
    aliasCommands: allEntries.filter((entry) => entry.type === 'alias-command').length,
    musicAliases: musicAliases.length,
    runtimeKeys: client.commands?.size || 0,
    collisions: client.commandRegistry?.collisions?.length || 0
  };

  return {
    prefix,
    commands,
    entries: allEntries,
    count: allEntries.length,
    commandCount: commands.length,
    displayCount: allEntries.length,
    counts,
    collisions: client.commandRegistry?.collisions || [],
    registryStats: client.commandRegistry?.stats || null,
    source: 'rumi-bot-runtime',
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  getCommandCatalog,
  serializeCommand,
  serializeEntry,
  serializeVirtualEntry
};
