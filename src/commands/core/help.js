const crypto = require('node:crypto');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const respond = require('../../utils/respond');
const { isBotOwner } = require('../../systems/owner/ownerManager');
const { getCommandCatalog } = require('../../services/api/commandCatalog');
const { DEFAULT_PREFIX } = require('../../systems/prefix/prefixManager');
const { getUsageLines, getExampleLines } = require('../../utils/commandUsage');
const db = require('../../services/database');
const emojis = require('../../utils/botEmojis');

const DOCS_URL = process.env.DOCS_URL || 'https://rumi.rocks/docs';
const DASHBOARD_URL = process.env.DASHBOARD_FRONTEND_URL || process.env.STUDIO_URL || process.env.DASHBOARD_PUBLIC_URL || process.env.DASHBOARD_URL || 'https://rumi.rocks/studio';

const CATEGORIES_PER_PAGE = 10;
const ENTRIES_PER_PAGE = 1;
const MAIN_QUERY = '_main';

const HELP_SESSION_TTL_MS = 15 * 60 * 1000;
const HELP_SESSIONS = new Map();

function lower(value = '') {
  return String(value || '').trim().toLowerCase();
}

function clampText(value = '', max = 1024) {
  const text = String(value || '').trim();
  if (!text) return 'n/a';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function unique(list = []) {
  return [...new Set(
    (list || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];
}

function cleanupHelpSessions() {
  const now = Date.now();

  for (const [id, session] of HELP_SESSIONS.entries()) {
    if (now - session.createdAt > HELP_SESSION_TTL_MS) {
      HELP_SESSIONS.delete(id);
    }
  }
}

function createHelpSession({ ownerId, guildId, query }) {
  cleanupHelpSessions();

  const id = crypto.randomBytes(5).toString('hex');

  HELP_SESSIONS.set(id, {
    id,
    ownerId,
    guildId,
    query: query || MAIN_QUERY,
    createdAt: Date.now()
  });

  return id;
}

function getHelpSession(id) {
  cleanupHelpSessions();
  return HELP_SESSIONS.get(id) || null;
}

function refreshHelpSession(id) {
  const session = HELP_SESSIONS.get(id);
  if (session) session.createdAt = Date.now();
  return session || null;
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

  return {
    tokens: copy,
    page: 1
  };
}

function pageSlice(items, page, perPage) {
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  const currentPage = Math.min(Math.max(1, page), pageCount);
  const slice = items.slice((currentPage - 1) * perPage, currentPage * perPage);

  return {
    slice,
    currentPage,
    pageCount
  };
}

function requesterAuthor(displayName, avatarUrl) {
  return {
    name: displayName,
    iconURL: avatarUrl || undefined
  };
}

function navRow(ownerId, sessionId, page, pageCount) {
  if (pageCount <= 1) return null;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`help:${ownerId}:${sessionId}:${Math.max(1, page - 1)}`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),

    new ButtonBuilder()
      .setCustomId(`help:${ownerId}:${sessionId}:${Math.min(pageCount, page + 1)}`)
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount)
  );
}

function linkRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Open Docs')
      .setURL(DOCS_URL),

    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Open Dashboard')
      .setURL(DASHBOARD_URL)
  );
}

function buildComponents({
  includeLinks = false,
  ownerId,
  sessionId,
  page = 1,
  pageCount = 1
}) {
  const rows = [];

  if (includeLinks) rows.push(linkRow());

  const nav = navRow(ownerId, sessionId, page, pageCount);
  if (nav) rows.push(nav);

  return rows;
}

function dedupeEntries(entries = []) {
  const map = new Map();

  for (const entry of entries) {
    if (!entry) continue;

    const key = [
      lower(entry.type || 'entry'),
      lower(entry.parent || ''),
      lower(entry.fullName || entry.name || '')
    ].join(':');

    if (!map.has(key)) {
      map.set(key, entry);
      continue;
    }

    const existing = map.get(key);

    const existingScore = [
      existing.description,
      existing.usageLines?.length,
      existing.examples?.length,
      existing.aliases?.length
    ].filter(Boolean).length;

    const incomingScore = [
      entry.description,
      entry.usageLines?.length,
      entry.examples?.length,
      entry.aliases?.length
    ].filter(Boolean).length;

    if (incomingScore > existingScore) {
      map.set(key, entry);
    }
  }

  return [...map.values()];
}

function getCatalogForUser(client, prefix, userId) {
  const owner = isBotOwner(userId);

  const catalog = getCommandCatalog(client, prefix, {
    includeHidden: owner,
    includeOwnerOnly: owner,
    includeMusicAliases: false
  });

  const entries = dedupeEntries(catalog.entries || []);

  return {
    ...catalog,
    entries,
    displayCount: entries.length,
    count: entries.length,
    counts: {
      ...(catalog.counts || {}),
      total: entries.length
    }
  };
}

function formatList(list = []) {
  const clean = unique(list);
  if (!clean.length) return 'n/a';
  return clampText(clean.join(', '));
}

function codeBlock(lines = []) {
  const clean = lines.filter(Boolean);
  return ['```txt', ...(clean.length ? clean : ['n/a']), '```'].join('\n');
}

function usageField(prefix, entry) {
  return clampText(codeBlock(getUsageLines(entry, prefix).slice(0, 8)));
}

function examplesField(prefix, entry) {
  return clampText(codeBlock(getExampleLines(entry, prefix).slice(0, 6)));
}

function entryTypeLabel(entry) {
  if (entry.type === 'command') return 'Command';
  if (entry.type === 'subcommand') return 'Subcommand';
  if (entry.type === 'alias-command') return 'Command Alias';
  if (entry.type === 'music-alias') return 'Music Alias';
  return 'Command Entry';
}

function formatDetails(entry) {
  const details = [
    `This is a ${entryTypeLabel(entry)}. Slash?: ${entry.slashLabel || 'Prefix only'}`,
  ];

  if (entry.parent) details.push(`Parent: ${entry.parent}`);
  if (entry.guildOnly) details.push('Guild only');
  if (entry.ownerOnly) details.push('Owner only');
  if (entry.nsfw) details.push('NSFW');
  if (entry.premiumLabel) details.push(`Premium: ${entry.premiumLabel}`);

  return details.join('\n');
}

function normalizeFlagDetails(entry = {}) {
  if (Array.isArray(entry.flagDetails) && entry.flagDetails.length) {
    return entry.flagDetails
      .map((item) => ({
        name: String(item?.name || '').trim(),
        description: String(item?.description || '').trim()
      }))
      .filter((item) => item.name);
  }

  if (Array.isArray(entry.flags) && entry.flags.length) {
    return entry.flags
      .map((name) => ({ name: String(name || '').trim(), description: '' }))
      .filter((item) => item.name);
  }

  return [];
}

function formatFlagLine(flag) {
  const name = String(flag?.name || '').trim();
  const description = String(flag?.description || '').trim();
  if (!name) return null;
  if (!description) return `\`${name}\``;
  return `\`${name}\` - ${description}`;
}

function formatEntryPage(prefix, entry, currentPage, pageCount, moduleName) {
  const usageLines = getUsageLines(entry, prefix).slice(0, 4);
  const exampleLines = getExampleLines(entry, prefix).slice(0, 4);
  const syntax = usageLines[0] || `${prefix}${entry.fullName}`;
  const example = exampleLines[0] || syntax;
  const details = [
    entry.parent ? `Parent: ${entry.parent}` : null,
    entry.aliases?.length ? `Aliases: ${formatList(entry.aliases)}` : null,
    entry.permissions?.length ? `User permissions: ${formatList(entry.permissions)}` : null,
    entry.botPermissions?.length ? `Bot permissions: ${formatList(entry.botPermissions)}` : null,
    entry.premiumLabel ? `Premium: ${entry.premiumLabel}` : null,
    entry.nsfw ? 'NSFW' : null,
    entry.guildOnly ? 'Guild only' : null,
    entry.ownerOnly ? 'Owner only' : null,
    entry.slashLabel || 'Prefix only'
  ].filter(Boolean);
  const fields = [
    {
      name: 'Usage',
      value: clampText(codeBlock(usageLines.length ? usageLines : [syntax])),
      inline: false
    },
    {
      name: 'Examples',
      value: clampText(codeBlock(exampleLines.length ? exampleLines : [example])),
      inline: false
    }
  ];

  if (details.length) {
    fields.push({ name: 'Details', value: clampText(details.join('\n')), inline: false });
  }

  const flagLines = normalizeFlagDetails(entry)
    .map(formatFlagLine)
    .filter(Boolean);

  if (flagLines.length) {
    fields.push({
      name: 'Flags',
      value: clampText(flagLines.join('\n')),
      inline: false
    });
  }

  const module = String(moduleName || entry.module || entry.category || 'misc').toLowerCase();

  return {
    description: entry.description || 'No description saved yet.',
    fields,
    footer: {
      text: pageCount > 1
        ? `${entryTypeLabel(entry)} ${currentPage}/${pageCount} | Module: ${module}`
        : `Module: ${module}`
    }
  };
}

async function resolvePrefix(guildId) {
  if (!guildId) return DEFAULT_PREFIX;

  const settings = await db.getGuildSettings(guildId).catch(() => null);
  return settings?.prefix || DEFAULT_PREFIX;
}

function groupCategories(entries = []) {
  const map = new Map();

  for (const entry of entries) {
    const category = String(entry.category || entry.module || 'misc').toLowerCase();
    map.set(category, (map.get(category) || 0) + 1);
  }

  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, count]) => `\`${category}\` (${count})`);
}

function buildMainPayload({ author, prefix, ownerId, sessionId, page, catalog }) {
  const categories = groupCategories(catalog.entries);
  const result = pageSlice(categories, page, CATEGORIES_PER_PAGE);

  const counts = catalog.counts || {};

  const statsLine = [
    counts.base ? `${counts.base} base` : null,
    counts.subcommands ? `${counts.subcommands} subcommands` : null,
    counts.aliasCommands ? `${counts.aliasCommands} aliases` : null,
    counts.musicAliases ? `${counts.musicAliases} music aliases` : null
  ].filter(Boolean).join(' | ');

  return {
    mentionUser: false,
    author,
    fields: [
      {
        name: 'Quick start',
        value: codeBlock([
          `Syntax: ${prefix}help command`,
          `${prefix}help economy`,
          `Syntax: ${prefix}help command subcommand`,
          `${prefix}help antinuke status`
        ]),
        inline: false
      },
      {
        name: 'Modules',
        value: result.slice.length ? clampText(result.slice.join(' | ')) : 'No categories found.',
        inline: false
      },
      {
        name: 'Tip',
        value: 'Use the dashboard for the searchable command browser, or search here by command, subcommand, or module.',
        inline: false
      }
    ],
    footer: {
      text: `Page ${result.currentPage}/${result.pageCount} (${categories.length} modules) | Commands: ${catalog.displayCount}`
    },
    components: buildComponents({
      includeLinks: true,
      ownerId,
      sessionId,
      page: result.currentPage,
      pageCount: result.pageCount
    })
  };
}

function entryMatchesName(entry, query) {
  const q = lower(query);
  if (!q) return false;

  if (lower(entry.fullName) === q) return true;
  if (lower(entry.name) === q) return true;

  return Array.isArray(entry.aliases) &&
    entry.aliases.map(lower).includes(q);
}

function findBaseCommandEntry(entries, token) {
  const q = lower(token);

  return entries.find((entry) =>
    entry.type === 'command' &&
    (
      lower(entry.name) === q ||
      lower(entry.fullName) === q ||
      entry.aliases?.map(lower).includes(q)
    )
  );
}

function entriesForCommand(entries, baseEntry) {
  if (!baseEntry) return [];

  const parentName = lower(baseEntry.name);

  const subcommands = entries
    .filter((entry) =>
      lower(entry.parent) === parentName &&
      entry.type === 'subcommand'
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));

  if (subcommands.length) return subcommands;

  return [baseEntry];
}

function findSubcommandEntry(entries, baseEntry, query) {
  const q = lower(query);
  const parentName = lower(baseEntry?.name || '');

  return entries.find((entry) =>
    lower(entry.parent) === parentName &&
    (
      lower(entry.name) === q ||
      lower(entry.fullName) === `${parentName} ${q}` ||
      entry.aliases?.map(lower).includes(q)
    )
  );
}

function entriesForCategory(entries, query) {
  const category = lower(query);

  return entries
    .filter((entry) => lower(entry.category || entry.module || 'misc') === category)
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function entriesForSearch(entries, query) {
  const q = lower(query);

  if (!q || q.length < 2) return [];

  return entries
    .filter((entry) =>
      lower(entry.fullName).includes(q) ||
      lower(entry.description).includes(q) ||
      entry.aliases?.some((alias) => lower(alias).includes(q))
    )
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

function buildEntryPayload({
  entries,
  prefix,
  sessionId,
  page,
  ownerId,
  author,
  moduleName,
  forceNoNavigation = false
}) {
  const cleanEntries = dedupeEntries(entries);

  if (!cleanEntries.length) return null;

  const result = pageSlice(cleanEntries, page, ENTRIES_PER_PAGE);
  const entry = result.slice[0];

  if (!entry) return null;

  const pageData = formatEntryPage(
    prefix,
    entry,
    result.currentPage,
    result.pageCount,
    moduleName || entry.category
  );

  const shouldPaginate = !forceNoNavigation && result.pageCount > 1;

  return {
    mentionUser: false,
    author: {
      name: entry.fullName,
      iconURL: author?.iconURL || undefined
    },
    description: pageData.description,
    fields: pageData.fields,
    footer: pageData.footer,
    components: shouldPaginate
      ? buildComponents({
          ownerId,
          sessionId,
          page: result.currentPage,
          pageCount: result.pageCount
        })
      : []
  };
}

function buildQueryPayload({ catalog, prefix, query, page, ownerId, author, sessionId }) {
  const entries = dedupeEntries(catalog.entries || []);
  const cleanQuery = lower(query);
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  if (!tokens.length) return null;

  const baseEntry = findBaseCommandEntry(entries, tokens[0]);

  if (baseEntry) {
    if (tokens.length > 1) {
      const subQuery = tokens.slice(1).join(' ');
      const exactMultiWord = entries.find((entry) => lower(entry.fullName) === cleanQuery);

      if (exactMultiWord && exactMultiWord.type !== 'command') {
        return buildEntryPayload({
          entries: [exactMultiWord],
          prefix,
          sessionId,
          page: 1,
          ownerId,
          author,
          moduleName: exactMultiWord.category,
          forceNoNavigation: true
        });
      }

      const requestedSubcommand = findSubcommandEntry(entries, baseEntry, subQuery);

      if (requestedSubcommand) {
        return buildEntryPayload({
          entries: [requestedSubcommand],
          prefix,
          sessionId,
          page: 1,
          ownerId,
          author,
          moduleName: requestedSubcommand.category,
          forceNoNavigation: true
        });
      }
    }

    const commandEntries = entriesForCommand(entries, baseEntry);

    return buildEntryPayload({
      entries: commandEntries,
      prefix,
      sessionId,
      page,
      ownerId,
      author,
      moduleName: baseEntry.category,
      forceNoNavigation: commandEntries.length <= 1
    });
  }

  const exact = entries.find((entry) => lower(entry.fullName) === cleanQuery);

  if (exact) {
    return buildEntryPayload({
      entries: [exact],
      prefix,
      sessionId,
      page: 1,
      ownerId,
      author,
      moduleName: exact.category,
      forceNoNavigation: true
    });
  }

  const categoryEntries = entriesForCategory(entries, cleanQuery);

  if (categoryEntries.length) {
    return buildEntryPayload({
      entries: categoryEntries,
      prefix,
      sessionId,
      page,
      ownerId,
      author,
      moduleName: cleanQuery,
      forceNoNavigation: categoryEntries.length <= 1
    });
  }

  const directEntry = entries.find((entry) => entryMatchesName(entry, cleanQuery));

  if (directEntry) {
    return buildEntryPayload({
      entries: [directEntry],
      prefix,
      sessionId,
      page: 1,
      ownerId,
      author,
      moduleName: directEntry.category,
      forceNoNavigation: true
    });
  }

  const searchResults = entriesForSearch(entries, cleanQuery);

  if (searchResults.length) {
    return buildEntryPayload({
      entries: searchResults,
      prefix,
      sessionId,
      page,
      ownerId,
      author,
      moduleName: 'search',
      forceNoNavigation: searchResults.length <= 1
    });
  }

  return null;
}

async function renderHelpPayload({
  client,
  guildId,
  ownerId,
  displayName,
  avatarUrl,
  query = MAIN_QUERY,
  page = 1,
  sessionId = null
}) {
  const prefix = await resolvePrefix(guildId);
  const author = requesterAuthor(displayName, avatarUrl);
  const catalog = getCatalogForUser(client, prefix, ownerId);
  const activeSessionId = sessionId || createHelpSession({ ownerId, guildId, query });

  if (!query || query === MAIN_QUERY) {
    return buildMainPayload({
      author,
      prefix,
      ownerId,
      sessionId: activeSessionId,
      page,
      catalog
    });
  }

  return buildQueryPayload({
    catalog,
    prefix,
    query,
    page,
    ownerId,
    author,
    sessionId: activeSessionId
  });
}

async function handleHelpInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('help:')) return false;

  const [, ownerId, sessionId, pageToken] = interaction.customId.split(':');

  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: 'This help panel belongs to someone else.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);

    return true;
  }

  const session = refreshHelpSession(sessionId);

  if (!session) {
    await interaction.reply({
      content: 'This help panel expired. Run the help command again.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);

    return true;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  const page = Math.max(1, Number(pageToken || 1));

  const payload = await renderHelpPayload({
    client: interaction.client,
    guildId: interaction.guildId,
    ownerId: interaction.user.id,
    displayName: interaction.member?.displayName || interaction.user.username,
    avatarUrl: interaction.user.displayAvatarURL?.(),
    query: session.query,
    page,
    sessionId
  });

  if (!payload) {
    await interaction.followUp({
      content: 'I could not load the next help page. Try running the help command again.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);

    return true;
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
  usage: [
    'help',
    'help command',
    'help command subcommand',
    'help category page'
  ],
  examples: [
    'help',
    'help lock',
    'help moderation',
    'help antinuke status',
    'help moderation 2'
  ],

  async execute({ client, message, args }) {
    const parsed = parsePage(args.map((arg) => String(arg).trim()).filter(Boolean));
    const query = parsed.tokens.length ? parsed.tokens.join(' ') : MAIN_QUERY;
    const sessionId = createHelpSession({
      ownerId: message.author.id,
      guildId: message.guild?.id,
      query
    });

    const payload = await renderHelpPayload({
      client,
      guildId: message.guild?.id,
      ownerId: message.author.id,
      displayName: message.member?.displayName || message.author.username,
      avatarUrl: message.author.displayAvatarURL?.(),
      query,
      page: parsed.page,
      sessionId
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
