const { PermissionFlagsBits } = require('discord.js');
const { DEFAULT_PREFIX } = require('../../systems/prefix/prefixManager');

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

function normalizeUsage(command) {
  const usage = command.usage || command.name;
  return String(usage).replace(/^[/,!.?]/, '');
}

function serializeSubcommands(command) {
  if (!Array.isArray(command.subcommands)) return [];

  return command.subcommands.map((sub) => ({
    name: sub.name || '',
    description: sub.description || '',
    usage: sub.usage || '',
    examples: Array.isArray(sub.examples) ? sub.examples : []
  }));
}

function serializeCommand(command) {
  return {
    name: command.name,
    prefix: DEFAULT_PREFIX,
    aliases: Array.isArray(command.aliases) ? command.aliases : [],
    category: command.category || 'misc',
    description: command.description || 'No description provided.',
    usage: normalizeUsage(command),
    permissions: Array.isArray(command.permissions)
      ? command.permissions.flatMap(permissionToNames).filter(Boolean)
      : [],
    botPermissions: Array.isArray(command.botPermissions)
      ? command.botPermissions.flatMap(permissionToNames).filter(Boolean)
      : [],
    examples: Array.isArray(command.examples)
      ? command.examples.map((ex) => String(ex).replace(/^[/,!.?]/, ''))
      : [],
    subcommands: serializeSubcommands(command)
  };
}

function getCommandCatalog(client) {
  const unique = new Map();

  for (const command of client.commands.values()) {
    if (!command?.name) continue;
    unique.set(command.name, serializeCommand(command));
  }

  const commands = [...unique.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    prefix: DEFAULT_PREFIX,
    commands,
    count: commands.length,
    source: 'rumi-bot-runtime',
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  getCommandCatalog
};