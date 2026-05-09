const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Collection, PermissionFlagsBits, SlashCommandBuilder, MessageFlags } = require('discord.js');
const logger = require('./logging/logger');
const { parseArgs } = require('./prefix/commandHandler');
const { isSlashSupported, listSupportedSlashCommands } = require('./slashManifest');
const { normalizeCommandMeta } = require('../utils/normalizeCommandMeta');
const respond = require('../utils/respond');

const registryCache = new WeakMap();
let fallbackRegistry = null;
const syncHashes = new Map();

function envFlag(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  return fallback;
}

function slashSyncEnabled() {
  if (String(process.env.ENABLE_SLASH_COMMANDS || '').trim().toLowerCase() === 'false') return false;
  return envFlag('SLASH_SYNC_ENABLED', true);
}

function slashSyncScope() {
  const raw = String(process.env.SLASH_SYNC_SCOPE || '').trim().toLowerCase();
  return raw === 'guild' ? 'guild' : 'global';
}

function slashSyncGuildId() {
  return String(
    process.env.SLASH_SYNC_GUILD_ID ||
    process.env.SLASH_COMMAND_GUILD_ID ||
    process.env.DISCORD_DEV_GUILD_ID ||
    process.env.DISCORD_GUILD_ID ||
    process.env.GUILD_ID ||
    ''
  ).trim();
}

function slashSyncMaxCommands() {
  return Math.min(100, Math.max(1, Number(process.env.SLASH_SYNC_MAX_COMMANDS || 95)));
}

function walkJsFiles(directory) {
  if (!fs.existsSync(directory)) return [];

  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsFiles(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function loadCommandsFromDisk() {
  const unique = new Map();
  const roots = [
    path.join(__dirname, '..', 'commands'),
    path.join(__dirname, '..', 'commands.js')
  ];

  for (const root of roots) {
    for (const file of walkJsFiles(root)) {
      try {
        delete require.cache[require.resolve(file)];
        const command = normalizeCommandMeta(require(file));
        if (!command?.name || typeof command.execute !== 'function') continue;
        if (!isSlashSupported(command.name)) continue;
        unique.set(command.name, command);
      } catch (error) {
        logger.warn({ error, file }, 'Skipping slash command module because it failed to load');
      }
    }
  }

  return [...unique.values()];
}

function uniqueCommands(client) {
  if (client?.commands?.size) {
    const seen = new Map();
    for (const command of client.commands.values()) {
      if (!command?.name || typeof command.execute !== 'function') continue;
      if (!isSlashSupported(command.name)) continue;
      seen.set(command.name, command);
    }
    return [...seen.values()];
  }

  return loadCommandsFromDisk();
}

function truncateDescription(value, fallback = 'No description provided.') {
  const text = String(value || fallback).trim();
  if (!text) return fallback;
  return text.slice(0, 100);
}

function combinePermissions(permissions = []) {
  if (!Array.isArray(permissions) || !permissions.length) return null;
  try {
    const combined = permissions.reduce((total, permission) => total | BigInt(permission), 0n);
    return combined > 0n ? combined.toString() : null;
  } catch {
    return null;
  }
}

function applyCommonSettings(builder, command) {
  if (command.guildOnly) builder.setDMPermission(false);
  const permissions = combinePermissions(command.permissions);
  if (permissions) builder.setDefaultMemberPermissions(permissions);
  return builder;
}

function genericOptionDescription(entry, fallback) {
  return truncateDescription(entry?.usage || fallback || 'Arguments for this command.');
}

function buildGenericSlashData(command) {
  const builder = applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description, `${command.name} command`)),
    command
  );

  if (Array.isArray(command.subcommands) && command.subcommands.length) {
    for (const sub of command.subcommands.slice(0, 25)) {
      builder.addSubcommand((subcommand) => {
        subcommand
          .setName(String(sub.name || 'action').slice(0, 32))
          .setDescription(truncateDescription(sub.description, `${command.name} ${sub.name}`))
          .addStringOption((option) =>
            option
              .setName('input')
              .setDescription(genericOptionDescription(sub, `${command.name} ${sub.name} arguments`))
              .setRequired(false)
          );
        return subcommand;
      });
    }

    return builder;
  }

  builder.addStringOption((option) =>
    option
      .setName('input')
      .setDescription(genericOptionDescription(command, `${command.name} arguments`))
      .setRequired(false)
  );

  return builder;
}

function buildHelpData(command) {
  return applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description))
      .addStringOption((option) =>
        option.setName('query').setDescription('Command, category, or search term').setRequired(false)
      )
      .addIntegerOption((option) =>
        option.setName('page').setDescription('Help page number').setRequired(false)
      ),
    command
  );
}

function buildVariablesData(command) {
  return applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description))
      .addStringOption((option) =>
        option.setName('query').setDescription('Variable name, category, or search term').setRequired(false)
      )
      .addIntegerOption((option) =>
        option.setName('page').setDescription('Variables page number').setRequired(false)
      ),
    command
  );
}

function buildDashboardData(command) {
  return applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description))
      .addSubcommand((subcommand) =>
        subcommand.setName('open').setDescription('Open the dashboard landing flow for this server')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('hotload').setDescription('Push a fresh command/runtime sync to the dashboard backend')
      ),
    command
  );
}

function buildPrefixData(command) {
  return applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description))
      .addSubcommand((subcommand) =>
        subcommand.setName('view').setDescription('Show the current prefix settings')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('set')
          .setDescription('Set a custom prefix')
          .addStringOption((option) =>
            option.setName('value').setDescription('New prefix').setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('default')
          .setDescription('Enable or disable the default fallback prefix')
          .addStringOption((option) =>
            option
              .setName('mode')
              .setDescription('Whether the fallback prefix stays enabled')
              .setRequired(true)
              .addChoices(
                { name: 'on', value: 'on' },
                { name: 'off', value: 'off' }
              )
          )
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('reset').setDescription('Reset the prefix to the default fallback')
      ),
    command
  );
}

function buildPremiumData(command) {
  return applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description))
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('Show active premium plans')
      )
      .addSubcommand((subcommand) =>
        subcommand.setName('features').setDescription('Show active premium perks')
      ),
    command
  );
}

function buildUserPremiumData(command) {
  return applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description))
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('Show active user premium for your account')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('redeem')
          .setDescription('Redeem a premium code for your account')
          .addStringOption((option) =>
            option.setName('code').setDescription('Premium code').setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('lookup')
          .setDescription('Owner-only lookup for a user premium scope')
          .addStringOption((option) =>
            option.setName('user').setDescription('Discord user ID').setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('grant')
          .setDescription('Owner-only manual grant for user premium')
          .addStringOption((option) =>
            option.setName('user').setDescription('Discord user ID').setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('billing')
              .setDescription('Billing cycle for the manual grant')
              .setRequired(false)
              .addChoices(
                { name: 'monthly', value: 'monthly' },
                { name: 'lifetime', value: 'lifetime' }
              )
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('revoke')
          .setDescription('Owner-only manual revoke for user premium')
          .addStringOption((option) =>
            option.setName('user').setDescription('Discord user ID').setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('repair')
          .setDescription('Owner-only repair for a paid user premium order')
          .addStringOption((option) =>
            option.setName('reference').setDescription('Order ID, receipt code, or support code').setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('user').setDescription('Discord user ID').setRequired(true)
          )
      ),
    command
  );
}

function buildServerPremiumData(command) {
  return applyCommonSettings(
    new SlashCommandBuilder()
      .setName(command.name)
      .setDescription(truncateDescription(command.description))
      .addSubcommand((subcommand) =>
        subcommand.setName('status').setDescription('Show active server premium for this server')
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('redeem')
          .setDescription('Redeem a premium code for a server')
          .addStringOption((option) =>
            option.setName('code').setDescription('Premium code').setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('target').setDescription('Server ID or invite link').setRequired(false)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('lookup')
          .setDescription('Owner-only lookup for a server premium scope')
          .addStringOption((option) =>
            option.setName('target').setDescription('Server ID or invite link').setRequired(true)
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('grant')
          .setDescription('Owner-only manual grant for server premium')
          .addStringOption((option) =>
            option.setName('target').setDescription('Server ID or invite link').setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('tier')
              .setDescription('Server premium tier')
              .setRequired(false)
              .addChoices(
                { name: 'base', value: 'base' },
                { name: 'tier1', value: 'tier1' },
                { name: 'tier2', value: 'tier2' },
                { name: 'tier3', value: 'tier3' }
              )
          )
          .addStringOption((option) =>
            option
              .setName('billing')
              .setDescription('Billing cycle for the manual grant')
              .setRequired(false)
              .addChoices(
                { name: 'monthly', value: 'monthly' },
                { name: 'lifetime', value: 'lifetime' }
              )
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('revoke')
          .setDescription('Owner-only manual revoke for server premium')
          .addStringOption((option) =>
            option.setName('target').setDescription('Server ID or invite link').setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName('tier')
              .setDescription('Server premium tier')
              .setRequired(false)
              .addChoices(
                { name: 'base', value: 'base' },
                { name: 'tier1', value: 'tier1' },
                { name: 'tier2', value: 'tier2' },
                { name: 'tier3', value: 'tier3' }
              )
          )
      )
      .addSubcommand((subcommand) =>
        subcommand
          .setName('repair')
          .setDescription('Owner-only repair for a paid server premium order')
          .addStringOption((option) =>
            option.setName('reference').setDescription('Order ID, receipt code, or support code').setRequired(true)
          )
          .addStringOption((option) =>
            option.setName('target').setDescription('Server ID or invite link').setRequired(true)
          )
      ),
    command
  );
}

function manualBuildArgs(commandName, interaction) {
  if (commandName === 'help' || commandName === 'variables') {
    const query = interaction.options.getString('query') || '';
    const page = interaction.options.getInteger('page');
    const args = query.trim() ? query.trim().split(/\s+/) : [];
    if (Number.isInteger(page) && page > 1) args.push(String(page));
    return args;
  }

  if (commandName === 'dashboard') {
    const action = interaction.options.getSubcommand();
    return action === 'hotload' ? ['hotload'] : [];
  }

  if (commandName === 'prefix') {
    const action = interaction.options.getSubcommand();
    if (action === 'set') {
      return ['set', interaction.options.getString('value', true)];
    }
    if (action === 'default') {
      return ['default', interaction.options.getString('mode', true)];
    }
    return [action];
  }

  if (commandName === 'premium') {
    return [interaction.options.getSubcommand()];
  }

  if (commandName === 'userpremium') {
    const action = interaction.options.getSubcommand();
    if (action === 'redeem') {
      return ['redeem', interaction.options.getString('code', true)];
    }
    if (action === 'lookup') {
      return ['lookup', interaction.options.getString('user', true)];
    }
    if (action === 'grant') {
      return ['grant', interaction.options.getString('user', true), interaction.options.getString('billing') || 'lifetime'];
    }
    if (action === 'revoke') {
      return ['revoke', interaction.options.getString('user', true)];
    }
    if (action === 'repair') {
      return ['repair', interaction.options.getString('reference', true), interaction.options.getString('user', true)];
    }
    return ['status'];
  }

  if (commandName === 'serverpremium') {
    const action = interaction.options.getSubcommand();
    if (action === 'redeem') {
      return [
        'redeem',
        interaction.options.getString('code', true),
        interaction.options.getString('target') || ''
      ];
    }
    if (action === 'lookup') {
      return ['lookup', interaction.options.getString('target', true)];
    }
    if (action === 'grant') {
      return [
        'grant',
        interaction.options.getString('target', true),
        interaction.options.getString('tier') || 'base',
        interaction.options.getString('billing') || 'lifetime'
      ];
    }
    if (action === 'revoke') {
      return [
        'revoke',
        interaction.options.getString('target', true),
        interaction.options.getString('tier') || 'base'
      ];
    }
    if (action === 'repair') {
      return [
        'repair',
        interaction.options.getString('reference', true),
        interaction.options.getString('target', true)
      ];
    }
    return ['status'];
  }

  return [];
}

const MANUAL_BUILDERS = Object.freeze({
  help: buildHelpData,
  variables: buildVariablesData,
  dashboard: buildDashboardData,
  prefix: buildPrefixData,
  premium: buildPremiumData,
  userpremium: buildUserPremiumData,
  serverpremium: buildServerPremiumData
});

function buildDefinition(command) {
  const builderFactory = MANUAL_BUILDERS[command.name];
  const data = builderFactory ? builderFactory(command) : buildGenericSlashData(command);
  return {
    name: command.name,
    data,
    execute: command.execute,
    buildArgs(interaction) {
      if (builderFactory) return manualBuildArgs(command.name, interaction);
      const input = interaction.options.getString('input') || '';
      if (Array.isArray(command.subcommands) && command.subcommands.length) {
        const subcommand = interaction.options.getSubcommand(false);
        return subcommand ? [subcommand, ...parseArgs(input)] : parseArgs(input);
      }
      return parseArgs(input);
    }
  };
}

function supportedCommandOrder() {
  return new Map(listSupportedSlashCommands().map((name, index) => [name, index]));
}

function buildRegistry(client = null) {
  const order = supportedCommandOrder();
  return uniqueCommands(client)
    .sort((left, right) => (order.get(left.name) ?? 999) - (order.get(right.name) ?? 999))
    .map(buildDefinition);
}

function getRegistry(client = null) {
  if (client?.commands?.size) {
    if (!registryCache.has(client)) {
      registryCache.set(client, buildRegistry(client));
    }
    return registryCache.get(client);
  }

  if (!fallbackRegistry) {
    fallbackRegistry = buildRegistry();
  }
  return fallbackRegistry;
}

function getSlashCommandData(client = null) {
  return getRegistry(client).map((entry) => entry.data.toJSON());
}

function interactionMessageContext(interaction) {
  return {
    member: interaction.member,
    guild: interaction.guild
  };
}

function inferPayloadType(payload) {
  const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];

  for (const embed of embeds) {
    const json = typeof embed?.toJSON === 'function' ? embed.toJSON() : embed;
    const color = Number(json?.color || 0);
    const description = String(json?.description || '');
    if (color === respond.ERROR_EMBED_COLOR || description.includes('<:bad:')) return 'bad';
  }

  return 'info';
}

function normalizePayload(payload, interaction) {
  if (typeof payload === 'string') {
    return respond.buildPayload('info', interaction.user, payload, {
      message: interactionMessageContext(interaction),
      allowedMentions: { parse: [] }
    });
  }

  const normalized = {
    ...(payload || {}),
    allowedMentions: payload?.allowedMentions || { parse: [] }
  };

  if (Array.isArray(normalized.embeds) && normalized.embeds.length) {
    return respond.stylePayload(inferPayloadType(normalized), interaction.user, normalized, {
      message: interactionMessageContext(interaction)
    });
  }

  return normalized;
}

async function sendInteractionPayload(interaction, payload) {
  const normalized = normalizePayload(payload, interaction);

  if (interaction.deferred && !interaction.replied) {
    await interaction.editReply(normalized).catch(() => null);
    return interaction.fetchReply().catch(() => null);
  }

  if (interaction.replied) {
    return interaction.followUp(normalized).catch(() => null);
  }

  await interaction.reply(normalized).catch(() => null);
  return interaction.fetchReply().catch(() => null);
}

function createInteractionMessageAdapter(interaction) {
  return {
    interaction,
    client: interaction.client,
    guild: interaction.guild,
    guildId: interaction.guildId,
    author: interaction.user,
    member: interaction.member,
    content: '',
    channel: {
      id: interaction.channelId,
      guild: interaction.guild,
      send: (payload) => sendInteractionPayload(interaction, payload),
      sendTyping: async () => {
        if (interaction.deferred || interaction.replied) return null;
        await interaction.deferReply().catch(() => null);
        return null;
      }
    },
    reply: (payload) => sendInteractionPayload(interaction, payload)
  };
}

async function handleSlashCommandInteraction(interaction) {
  const definition = getRegistry(interaction.client).find((entry) => entry.name === interaction.commandName);

  if (!definition) return false;

  const message = createInteractionMessageAdapter(interaction);
  const args = definition.buildArgs(interaction);

  try {
    await definition.execute({
      client: interaction.client,
      message,
      args,
      prefix: '/',
      commandName: interaction.commandName
    });
    return true;
  } catch (error) {
    logger.error({ error, command: interaction.commandName }, 'Slash command failed');

    const payload = respond.buildPayload('bad', interaction.user, `Something broke while running /${interaction.commandName}.`, {
      message: interactionMessageContext(interaction)
    });
    payload.flags = MessageFlags.Ephemeral;

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }

    return true;
  }
}

function comparableOption(option) {
  return {
    type: option.type,
    name: option.name,
    description: option.description,
    required: option.required ?? false,
    choices: (option.choices || []).map((choice) => ({ name: choice.name, value: choice.value })),
    options: (option.options || []).map(comparableOption)
  };
}

function comparableCommand(command) {
  return {
    name: command.name,
    description: command.description,
    dm_permission: command.dm_permission ?? true,
    default_member_permissions: command.default_member_permissions ?? null,
    options: (command.options || []).map(comparableOption)
  };
}

function registryHash(commands) {
  const normalized = commands
    .map(comparableCommand)
    .sort((left, right) => left.name.localeCompare(right.name));
  return crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

async function syncApplicationCommands(client) {
  if (!client?.application) return null;
  if (!slashSyncEnabled()) {
    logger.info('Slash command sync is disabled by SLASH_SYNC_ENABLED=false');
    return null;
  }

  const commands = getSlashCommandData(client);
  const maxCommands = slashSyncMaxCommands();

  if (commands.length > maxCommands) {
    logger.warn(
      { count: commands.length, maxCommands },
      'Slash command sync refused because it would exceed the configured command cap'
    );
    return { ok: false, skipped: true, reason: 'too_many_commands', count: commands.length, maxCommands };
  }

  const guildId = slashSyncScope() === 'guild' ? slashSyncGuildId() : '';

  if (slashSyncScope() === 'guild' && !guildId) {
    logger.warn('Slash command sync scope is guild, but SLASH_SYNC_GUILD_ID is missing; skipping sync');
    return { ok: false, skipped: true, reason: 'missing_guild_id', count: commands.length };
  }

  const manager = guildId
    ? (await client.guilds.fetch(guildId)).commands
    : client.application.commands;
  const scope = guildId ? `guild:${guildId}` : 'global';
  const desiredHash = registryHash(commands);

  if (syncHashes.get(scope) === desiredHash) {
    return { ok: true, scope, skipped: true, count: commands.length };
  }

  const existing = await manager.fetch();
  const existingHash = registryHash(existing.map((entry) => entry.toJSON()));

  if (existingHash === desiredHash) {
    syncHashes.set(scope, desiredHash);
    return { ok: true, scope, skipped: true, count: commands.length };
  }

  await manager.set(commands);
  syncHashes.set(scope, desiredHash);
  logger.info({ scope, count: commands.length }, 'Slash commands synchronized');
  return { ok: true, scope, skipped: false, count: commands.length };
}

module.exports = {
  getSlashCommandData,
  handleSlashCommandInteraction,
  createInteractionMessageAdapter,
  syncApplicationCommands
};
