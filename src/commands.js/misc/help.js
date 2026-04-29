const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const respond = require('../../utils/respond');
const { isBotOwner } = require('../../systems/owner/ownerManager');
const { serializeCommand } = require('../../services/api/commandCatalog');
const { DEFAULT_PREFIX } = require('../../systems/prefix/prefixManager');
const db = require('../../services/database');
const emojis = require('../../utils/botEmojis');

const DOCS_URL = process.env.DOCS_URL || 'https://rumi.rocks/docs';
const DASHBOARD_URL = process.env.DASHBOARD_PUBLIC_URL || process.env.DASHBOARD_URL || 'https://rumi.rocks/dashboard';
const CATEGORIES_PER_PAGE = 10;
const MAIN_QUERY = '_main';

function uniqueCommands(client) {
  const seen = new Set();
  const output = [];

  for (const command of client.commands.values()) {
    if (!command?.name || seen.has(command.name)) continue;
    seen.add(command.name);
    output.push(command);
  }

  return output.sort((a, b) => a.name.localeCompare(b.name));
}

function visibleCommands(client, userId) {
  const owner = isBotOwner(userId);
  return uniqueCommands(client).filter((command) => {
    if (command.hidden && !owner) return false;
    if (command.ownerOnly && !owner) return false;
    return true;
  });
}

function parsePage(tokens) {
  const copy = [...tokens];
  const last = copy.at(-1);

  if (/^\d+$/.test(String(last || ''))) {
    return {
      tokens: copy.slice(0, -1),
      page: Math.max(1, Number(last))
    };
  }

  return { tokens: copy, page: 1 };
}

function pageSlice(items, page, perPage) {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const slice = items.slice((currentPage - 1) * perPage, currentPage * perPage);
  return { slice, currentPage, pageCount };
}

function requesterAuthor(displayName, avatarUrl) {
  return {
    name: displayName,
    iconURL: avatarUrl || undefined
  };
}

function humanizeParameterToken(token) {
  const cleaned = String(token || '').replace(/[<>\[\]]/g, '').trim();
  if (!cleaned) return null;

  if (cleaned.includes('|')) {
    return cleaned
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean)
      .join(', ');
  }

  return cleaned;
}

function formatParameters(parameters) {
  const raw = String(parameters || '').trim();
  if (!raw || raw === 'n/a') return 'n/a';

  const pieces = raw.match(/<[^>]+>|\[[^\]]+\]|\S+/g) || [];
  const formatted = pieces
    .map(humanizeParameterToken)
    .filter(Boolean)
    .join(', ');

  return formatted || 'n/a';
}

function navRow(ownerId, query, page, pageCount) {
  if (pageCount <= 1) return null;
  const encode = encodeURIComponent(query || MAIN_QUERY);

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help:${ownerId}:${Math.max(1, page - 1)}:${encode}`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`help:${ownerId}:${Math.min(pageCount, page + 1)}:${encode}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(page >= pageCount)
  );
}

function linkRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Docs').setURL(DOCS_URL),
    new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Dashboard').setURL(DASHBOARD_URL)
  );
}

function buildComponents({ includeLinks = false, ownerId, query, page = 1, pageCount = 1 }) {
  const rows = [];
  if (includeLinks) rows.push(linkRow());
  const nav = navRow(ownerId, query, page, pageCount);
  if (nav) rows.push(nav);
  return rows;
}

function usageBlock(prefix, entry) {
  const syntax = `${prefix}${entry.usage || entry.fullName}`;
  const examples = Array.isArray(entry.examples) && entry.examples.length
    ? entry.examples.slice(0, 4)
    : [syntax];

  return [
    '```',
    `Syntax: ${syntax}`,
    ...examples.map((example) => `Example: ${example}`),
    '```'
  ].join('\n');
}

function formatEntryPage(prefix, entry, currentPage, pageCount, moduleName) {
  const fields = [
    { name: 'Aliases', value: entry.aliases?.length ? entry.aliases.join(', ') : 'n/a', inline: false },
    { name: 'Parameter', value: formatParameters(entry.parameters), inline: false },
    { name: 'Information', value: entry.information || 'n/a', inline: false },
    { name: 'Usage', value: usageBlock(prefix, entry), inline: false }
  ];

  if (entry.premiumLabel) {
    fields.splice(3, 0, { name: 'Premium', value: entry.premiumLabel, inline: false });
  }

  fields.splice(entry.premiumLabel ? 4 : 3, 0, {
    name: 'Slash Support',
    value: entry.slashLabel || 'Prefix only',
    inline: false
  });

  if (entry.flags?.length) {
    fields.push({ name: 'Flags', value: entry.flags.join(', '), inline: false });
  }

  return {
    description: `**${entry.fullName}**\n> ${entry.description || 'No description saved yet.'}`,
    fields,
    footer: {
      text: `Page ${currentPage}/${pageCount} (${pageCount} entries) • Module: ${String(moduleName || entry.module || 'misc').toLowerCase()}`
    }
  };
}

function flattenCommand(rawCommand, prefix) {
  const command = serializeCommand(rawCommand, prefix);
  return [command, ...(command.subcommands || [])];
}

async function resolvePrefix(guildId) {
  if (!guildId) return DEFAULT_PREFIX;
  const settings = await db.getGuildSettings(guildId).catch(() => null);
  return settings?.prefix || DEFAULT_PREFIX;
}

function buildMainPayload({ author, prefix, ownerId, page, categories }) {
  const result = pageSlice(categories, page, CATEGORIES_PER_PAGE);
  return {
    mentionUser: false,
    author,
    description: [
      `**${emojis.ai} Rumi Help**`,
      'Use the dashboard for the full command browser.',
      '',
      'Docs are still under construction, so the dashboard is the better index right now.',
      '',
      '```',
      `Command details: ${prefix}help <command>`,
      `Subcommand details: ${prefix}help <command> <subcommand>`,
      `Paged command browser: ${prefix}help <category> [page]`,
      '```',
      '',
      result.slice.join(' • ')
    ].join('\n'),
    footer: {
      text: `Page ${result.currentPage}/${result.pageCount} (${categories.length} categories) • Module: core`
    },
    components: buildComponents({
      includeLinks: true,
      ownerId,
      query: MAIN_QUERY,
      page: result.currentPage,
      pageCount: result.pageCount
    })
  };
}

function buildQueryPayload({ commands, prefix, query, page, ownerId, author }) {
  const tokens = String(query || '').split(/\s+/).filter(Boolean).map((token) => token.toLowerCase());
  const rawCommand = commands.find((cmd) => cmd.name === tokens[0] || cmd.aliases?.map((alias) => alias.toLowerCase()).includes(tokens[0]));

  if (rawCommand) {
    const entries = flattenCommand(rawCommand, prefix);
    if (tokens[1]) {
      const requested = entries.find((entry) =>
        entry.type === 'subcommand' &&
        (entry.name.toLowerCase() === tokens[1] || entry.aliases?.map((alias) => alias.toLowerCase()).includes(tokens[1]))
      );

      if (requested) {
        const pageData = formatEntryPage(prefix, requested, 1, 1, rawCommand.category);
        return {
          mentionUser: false,
          author,
          description: pageData.description,
          fields: pageData.fields,
          footer: { text: `Page 1/1 (1 entries) • Module: ${String(rawCommand.category || 'misc').toLowerCase()}` },
          components: []
        };
      }
    }

    const current = Math.min(Math.max(1, page), entries.length);
    const entry = entries[current - 1];
    const pageData = formatEntryPage(prefix, entry, current, entries.length, rawCommand.category);
    return {
      mentionUser: false,
      author,
      description: pageData.description,
      fields: pageData.fields,
      footer: pageData.footer,
      components: buildComponents({ ownerId, query: rawCommand.name, page: current, pageCount: entries.length })
    };
  }

  const categoryEntries = commands
    .filter((cmd) => String(cmd.category || 'misc').toLowerCase() === query.toLowerCase())
    .flatMap((cmd) => flattenCommand(cmd, prefix));

  if (!categoryEntries.length) return null;

  const current = Math.min(Math.max(1, page), categoryEntries.length);
  const entry = categoryEntries[current - 1];
  const pageData = formatEntryPage(prefix, entry, current, categoryEntries.length, query);
  return {
    mentionUser: false,
    author,
    description: pageData.description,
    fields: pageData.fields,
    footer: pageData.footer,
    components: buildComponents({ ownerId, query, page: current, pageCount: categoryEntries.length })
  };
}

async function renderHelpPayload({ client, guildId, ownerId, displayName, avatarUrl, query = MAIN_QUERY, page = 1 }) {
  const prefix = await resolvePrefix(guildId);
  const author = requesterAuthor(displayName, avatarUrl);
  const commands = visibleCommands(client, ownerId);

  if (!query || query === MAIN_QUERY) {
    const categories = [...new Set(commands.map((command) => String(command.category || 'misc').toLowerCase()))].sort();
    return buildMainPayload({ author, prefix, ownerId, page, categories });
  }

  return buildQueryPayload({ commands, prefix, query, page, ownerId, author });
}

async function handleHelpInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('help:')) return false;

  const [, ownerId, pageToken, encodedQuery] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: 'This help panel belongs to someone else.', ephemeral: true }).catch(() => null);
    return true;
  }

  const payload = await renderHelpPayload({
    client: interaction.client,
    guildId: interaction.guildId,
    ownerId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL?.(),
    query: decodeURIComponent(encodedQuery || MAIN_QUERY),
    page: Math.max(1, Number(pageToken || 1))
  });

  if (!payload) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => null);
    }
    await interaction.message.edit({ content: 'I could not load that help entry anymore.', embeds: [], components: [] }).catch(() => null);
    return true;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  const built = respond.buildPayload('info', interaction.user, null, {
    ...payload,
    guildId: interaction.guildId
  });

  await interaction.message.edit(built).catch(async () => {
    await interaction.editReply(built).catch(() => null);
  });
  return true;
}

module.exports = {
  name: 'help',
  aliases: ['commands', 'cmds'],
  category: 'core',
  description: 'Shows Rumi command help and documentation links.',
  usage: 'help [category|command|command subcommand] [page]',
  examples: ['help', 'help lock', 'help moderation', 'help antinuke status', 'help moderation 2'],

  async execute({ client, message, args }) {
    const parsed = parsePage(args.map((arg) => String(arg).trim()).filter(Boolean));
    const query = parsed.tokens.length ? parsed.tokens.join(' ') : MAIN_QUERY;
    const payload = await renderHelpPayload({
      client,
      guildId: message.guild?.id,
      ownerId: message.author.id,
      displayName: message.member?.displayName || message.author.username,
      avatarUrl: message.author.displayAvatarURL?.(),
      query,
      page: parsed.page
    });

    if (!payload) {
      return respond.reply(message, 'bad', 'I could not find help for that command or module.');
    }

    return respond.reply(message, 'info', null, {
      ...payload,
      useWebhook: false
    });
  },

  renderHelpPayload,
  handleHelpInteraction
};
