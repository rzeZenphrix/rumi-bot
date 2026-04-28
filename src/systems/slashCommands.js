const { PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const logger = require('./logging/logger');
const pingCommand = require('../commands.js/misc/ping');
const helpCommand = require('../commands.js/misc/help');
const variablesCommand = require('../commands.js/utility/variables');
const dashboardCommand = require('../commands.js/utility/dashboard');
const prefixCommand = require('../commands.js/misc/prefix');
const serverPremiumCommand = require('../commands.js/core/serverpremium');

function normalizePayload(payload) {
  if (typeof payload === 'string') {
    return { content: payload, allowedMentions: { parse: [] } };
  }

  return {
    ...(payload || {}),
    allowedMentions: payload?.allowedMentions || { parse: [] }
  };
}

async function sendInteractionPayload(interaction, payload) {
  const normalized = normalizePayload(payload);

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

function buildHelpArgs(interaction) {
  const query = interaction.options.getString('query') || '';
  const page = interaction.options.getInteger('page');
  const args = query.trim() ? query.trim().split(/\s+/) : [];

  if (Number.isInteger(page) && page > 1) {
    args.push(String(page));
  }

  return args;
}

function buildVariablesArgs(interaction) {
  const query = interaction.options.getString('query') || '';
  const page = interaction.options.getInteger('page');
  const args = query.trim() ? query.trim().split(/\s+/) : [];

  if (Number.isInteger(page) && page > 1) {
    args.push(String(page));
  }

  return args;
}

function buildDashboardArgs(interaction) {
  const action = interaction.options.getSubcommand();
  return action === 'sync' ? ['sync'] : [];
}

function buildPrefixArgs(interaction) {
  const action = interaction.options.getSubcommand();

  if (action === 'set') {
    return ['set', interaction.options.getString('value', true)];
  }

  if (action === 'default') {
    return ['default', interaction.options.getString('mode', true)];
  }

  return [action];
}

function buildServerPremiumArgs(interaction) {
  const action = interaction.options.getSubcommand();

  if (action === 'redeem') {
    return [
      'redeem',
      interaction.options.getString('code', true),
      interaction.options.getString('target') || ''
    ];
  }

  return ['status'];
}

const slashCommands = [
  {
    name: pingCommand.name,
    data: new SlashCommandBuilder()
      .setName(pingCommand.name)
      .setDescription(pingCommand.description),
    execute: pingCommand.execute,
    buildArgs: () => []
  },
  {
    name: helpCommand.name,
    data: new SlashCommandBuilder()
      .setName(helpCommand.name)
      .setDescription(helpCommand.description)
      .addStringOption((option) => option.setName('query').setDescription('Command, category, or search term').setRequired(false))
      .addIntegerOption((option) => option.setName('page').setDescription('Help page number').setRequired(false)),
    execute: helpCommand.execute,
    buildArgs: buildHelpArgs
  },
  {
    name: variablesCommand.name,
    data: new SlashCommandBuilder()
      .setName(variablesCommand.name)
      .setDescription(variablesCommand.description)
      .addStringOption((option) => option.setName('query').setDescription('Variable name, category, or search term').setRequired(false))
      .addIntegerOption((option) => option.setName('page').setDescription('Variables page number').setRequired(false)),
    execute: variablesCommand.execute,
    buildArgs: buildVariablesArgs
  },
  {
    name: dashboardCommand.name,
    data: new SlashCommandBuilder()
      .setName(dashboardCommand.name)
      .setDescription(dashboardCommand.description)
      .setDMPermission(false)
      .addSubcommand((subcommand) => subcommand.setName('open').setDescription('Open the dashboard for this server'))
      .addSubcommand((subcommand) => subcommand.setName('sync').setDescription('Push a fresh runtime sync to the dashboard backend')),
    execute: dashboardCommand.execute,
    buildArgs: buildDashboardArgs
  },
  {
    name: prefixCommand.name,
    data: new SlashCommandBuilder()
      .setName(prefixCommand.name)
      .setDescription(prefixCommand.description)
      .setDMPermission(false)
      .addSubcommand((subcommand) => subcommand.setName('view').setDescription('Show the current prefix settings'))
      .addSubcommand((subcommand) => subcommand.setName('set').setDescription('Set a custom prefix').addStringOption((option) => option.setName('value').setDescription('New prefix').setRequired(true)))
      .addSubcommand((subcommand) => subcommand.setName('default').setDescription('Enable or disable the default fallback prefix').addStringOption((option) => option.setName('mode').setDescription('on or off').setRequired(true).addChoices({ name: 'on', value: 'on' }, { name: 'off', value: 'off' })))
      .addSubcommand((subcommand) => subcommand.setName('reset').setDescription('Reset the prefix to the default fallback')), 
    execute: prefixCommand.execute,
    buildArgs: buildPrefixArgs
  },
  {
    name: serverPremiumCommand.name,
    data: new SlashCommandBuilder()
      .setName(serverPremiumCommand.name)
      .setDescription(serverPremiumCommand.description)
      .setDMPermission(false)
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild.toString())
      .addSubcommand((subcommand) => subcommand.setName('status').setDescription('Show active server premium for this server'))
      .addSubcommand((subcommand) => subcommand.setName('redeem').setDescription('Redeem a premium code for a server').addStringOption((option) => option.setName('code').setDescription('Premium code').setRequired(true)).addStringOption((option) => option.setName('target').setDescription('Server ID or invite link').setRequired(false))),
    execute: serverPremiumCommand.execute,
    buildArgs: buildServerPremiumArgs
  }
];

const slashCommandMap = new Map(slashCommands.map((entry) => [entry.name, entry]));

function getSlashCommandData() {
  return slashCommands.map((entry) => entry.data.toJSON());
}

async function handleSlashCommandInteraction(interaction) {
  const definition = slashCommandMap.get(interaction.commandName);

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

    const payload = {
      content: `Something broke while running /${interaction.commandName}.`,
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(payload).catch(() => null);
    } else {
      await interaction.reply(payload).catch(() => null);
    }

    return true;
  }
}

module.exports = {
  getSlashCommandData,
  handleSlashCommandInteraction,
  createInteractionMessageAdapter
};