const crypto = require('node:crypto');
const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize
} = require('discord.js');

const respond = require('../../utils/respond');
const { isBotOwner } = require('../../systems/owner/ownerManager');
const { getCommandCatalog } = require('../../services/api/commandCatalog');
const { DEFAULT_PREFIX } = require('../../systems/prefix/prefixManager');
const { getUsageLines, getExampleLines } = require('../../utils/commandUsage');
const db = require('../../services/database');
const emojis = require('../../utils/botEmojis');

const DOCS_URL = process.env.DOCS_URL || 'https://docs.rumi.rocks';
const DASHBOARD_URL =
  process.env.DASHBOARD_FRONTEND_URL ||
  process.env.STUDIO_URL ||
  process.env.DASHBOARD_PUBLIC_URL ||
  process.env.DASHBOARD_URL ||
  'https://rumi.rocks/studio';

const CATEGORIES_PER_PAGE = 10;
const COMMANDS_PER_PAGE = 6;
const ENTRIES_PER_PAGE = 1;
const MAIN_QUERY = '_main';

const HELP_SESSION_TTL_MS = 15 * 60 * 1000;
const HELP_SESSIONS = new Map();

const COLORS = {
  ice: 0xc8d8f2,
  good: 0xbff7d3,
  warn: 0xffcc66,
  bad: 0xed4245,
  premium: 0xdcc7ff
};

function lower(value = '') {
  return String(value || '').trim().toLowerCase();
}

function clampText(value = '', max = 1024) {
  const text = String(value || '').trim();
  if (!text) return 'n/a';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function clampComponentText(value = '', max = 3800) {
  const text = String(value || '').trim();
  if (!text) return '\u200B';
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function unique(list = []) {
  return [...new Set(
    (list || [])
      .map((item) => String(item || '').trim())
      .filter(Boolean)
  )];
}

function icon(name) {
  return String(emojis?.[name] || '').trim();
}

function withIcon(name, text) {
  const emoji = icon(name);
  return emoji ? `${emoji} ${text}` : text;
}

function codeBlock(lines = []) {
  const clean = lines.filter(Boolean);
  return ['```txt', ...(clean.length ? clean : ['n/a']), '```'].join('\n');
}

function inlineList(list = []) {
  const clean = unique(list);
  return clean.length ? clean.map((item) => `\`${item}\``).join(', ') : 'n/a';
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

function refreshHelpSession(id) {
  cleanupHelpSessions();

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
    name: displayName || 'User',
    iconURL: avatarUrl || null
  };
}

function setButtonEmoji(button, emoji) {
  const value = String(emoji || '').trim();
  if (value) button.setEmoji(value);
  return button;
}

function navRow(ownerId, sessionId, page, pageCount) {
  if (pageCount <= 1) return null;

  const prev = new ButtonBuilder()
    .setCustomId(`help:${ownerId}:${sessionId}:${Math.max(1, page - 1)}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 1);

  const next = new ButtonBuilder()
    .setCustomId(`help:${ownerId}:${sessionId}:${Math.min(pageCount, page + 1)}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= pageCount);

  setButtonEmoji(prev, icon('prev'));
  setButtonEmoji(next, icon('next'));

  if (!icon('prev')) prev.setLabel('Previous');
  if (!icon('next')) next.setLabel('Next');

  const pageButton = new ButtonBuilder()
    .setCustomId(`help:${ownerId}:${sessionId}:page`)
    .setLabel(`${page}/${pageCount}`)
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  return new ActionRowBuilder().addComponents(prev, pageButton, next);
}

function linkRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Docs')
      .setURL(DOCS_URL),

    new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setLabel('Dashboard')
      .setURL(DASHBOARD_URL)
  );
}

function textDisplay(content) {
  return new TextDisplayBuilder().setContent(clampComponentText(content));
}

function separator({ divider = true, large = false } = {}) {
  const builder = new SeparatorBuilder().setDivider(divider);

  if (typeof builder.setSpacing === 'function') {
    builder.setSpacing(
      large
        ? SeparatorSpacingSize?.Large ?? 2
        : SeparatorSpacingSize?.Small ?? 1
    );
  }

  return builder;
}

function makeV2Payload(components = []) {
  return {
    content: null,
    embeds: [],
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] }
  };
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

function entryTypeLabel(entry) {
  if (entry.type === 'command') return 'Command';
  if (entry.type === 'subcommand') return 'Subcommand';
  if (entry.type === 'alias-command') return 'Command Alias';
  if (entry.type === 'music-alias') return 'Music Alias';
  return 'Command Entry';
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
      .map((flag) => {
        if (!flag) return null;
        if (typeof flag === 'string') {
          const name = String(flag || '').trim();
          return name ? { name, description: '' } : null;
        }
        if (typeof flag === 'object') {
          const name = String(flag.name || flag.flag || flag.key || '').trim();
          const description = String(flag.description || flag.desc || flag.help || '').trim();
          return name ? { name, description } : null;
        }
        return null;
      })
      .filter(Boolean);
  }

  return [];
}

function formatFlagLine(flag) {
  const name = String(flag?.name || '').trim();
  const description = String(flag?.description || '').trim();

  if (!name) return null;
  if (!description) return `\`${name}\``;

  return `\`${name}\` — ${description}`;
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
    .map(([category, count]) => ({ category, count }));
}

function commandLine(prefix, entry, index = null) {
  const number = index !== null ? `**${String(index).padStart(2, '0')}.** ` : '';
  const name = `\`${prefix}${entry.fullName || entry.name}\``;
  const description = clampText(entry.description || 'No description saved yet.', 120);

  const tags = [
    entry.type === 'subcommand' ? 'subcommand' : null,
    entry.slashLabel && entry.slashLabel !== 'Prefix only' ? 'slash' : null,
    entry.premiumLabel ? 'premium' : null,
    entry.ownerOnly ? 'owner' : null,
    entry.guildOnly ? 'server' : null
  ].filter(Boolean);

  const suffix = tags.length ? `\n> ${tags.map((tag) => `\`${tag}\``).join(' ')}` : '';

  return `${number}**${name}**\n${description}${suffix}`;
}

function buildHeaderText({ author, prefix, catalog }) {
  const counts = catalog.counts || {};

  const stats = [
    counts.base ? `${counts.base} base` : null,
    counts.subcommands ? `${counts.subcommands} subcommands` : null,
    counts.aliasCommands ? `${counts.aliasCommands} aliases` : null
  ].filter(Boolean).join(' • ');

  return [
    `Welcome, **${author.name}**. Use this panel to browse modules, inspect command syntax, and jump between pages.`,
    '',
    `> Prefix: \`${prefix}\``,
    `> Commands: \`${catalog.displayCount}\`${stats ? ` • ${stats}` : ''}`
  ].join('\n');
}

function buildMainPayload({ author, prefix, ownerId, sessionId, page, catalog }) {
  const categories = groupCategories(catalog.entries);
  const result = pageSlice(categories, page, CATEGORIES_PER_PAGE);

  const moduleLines = result.slice.map((item, index) => {
    const absolute = (result.currentPage - 1) * CATEGORIES_PER_PAGE + index + 1;
    return `**${String(absolute).padStart(2, '0')}.** \`${item.category}\` — ${item.count} command${item.count === 1 ? '' : 's'}`;
  });

  const quickStart = [
    `${prefix}help`,
    `${prefix}help moderation`,
    `${prefix}help lock`,
    `${prefix}help antinuke status`,
    `${prefix}help economy 2`
  ];

  const container = new ContainerBuilder()
    .setAccentColor(COLORS.ice)
    .addTextDisplayComponents(textDisplay(buildHeaderText({ author, prefix, catalog })))
    .addSeparatorComponents(separator({ large: true }))
    .addTextDisplayComponents(textDisplay([
      `## ${withIcon('msg', 'Quick start')}`,
      codeBlock(quickStart)
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(textDisplay([
      `## Modules`,
      moduleLines.length ? moduleLines.join('\n') : 'No modules found.',
      '',
      `Use \`${prefix}help <module>\` to open a module, or \`${prefix}help <command>\` to view a command card.`
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addActionRowComponents(linkRow());

  const nav = navRow(ownerId, sessionId, result.currentPage, result.pageCount);
  if (nav) container.addActionRowComponents(nav);

  container.addSeparatorComponents(separator({ divider: false }));
  container.addTextDisplayComponents(textDisplay(
    `Page **${result.currentPage}/${result.pageCount}** • ${categories.length} modules • session expires after 15 minutes`
  ));

  return makeV2Payload([container]);
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

function formatDetails(entry) {
  const details = [
    `Type: ${entryTypeLabel(entry)}`,
    entry.parent ? `Parent: ${entry.parent}` : null,
    entry.category ? `Module: ${entry.category}` : null,
    entry.slashLabel || 'Prefix only',
    entry.guildOnly ? 'Guild only' : null,
    entry.ownerOnly ? 'Owner only' : null,
    entry.nsfw ? 'NSFW' : null,
    entry.premiumLabel ? `Premium: ${entry.premiumLabel}` : null
  ].filter(Boolean);

  return details.join('\n');
}

function buildCommandDetailPayload({
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

  const usageLines = getUsageLines(entry, prefix).slice(0, 5);
  const exampleLines = getExampleLines(entry, prefix).slice(0, 5);
  const flags = normalizeFlagDetails(entry)
    .map(formatFlagLine)
    .filter(Boolean);

  const aliases = entry.aliases?.length ? inlineList(entry.aliases) : 'n/a';
  const userPermissions = entry.permissions?.length ? inlineList(entry.permissions) : 'n/a';
  const botPermissions = entry.botPermissions?.length ? inlineList(entry.botPermissions) : 'n/a';

  const module = String(moduleName || entry.module || entry.category || 'misc').toLowerCase();

  const container = new ContainerBuilder()
    .setAccentColor(entry.premiumLabel ? COLORS.premium : COLORS.ice)
    .addTextDisplayComponents(textDisplay([
      `# ${withIcon('info', entry.fullName || entry.name)}`,
      entry.description || 'No description saved yet.',
      '',
      `> ${formatDetails(entry).replace(/\n/g, '\n> ')}`
    ].join('\n')))
    .addSeparatorComponents(separator({ large: true }))
    .addTextDisplayComponents(textDisplay([
      `## Usage`,
      codeBlock(usageLines.length ? usageLines : [`${prefix}${entry.fullName || entry.name}`])
    ].join('\n')))
    .addTextDisplayComponents(textDisplay([
      `## Examples`,
      codeBlock(exampleLines.length ? exampleLines : [`${prefix}${entry.fullName || entry.name}`])
    ].join('\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(textDisplay([
      `## Command metadata`,
      `**Aliases:** ${aliases}`,
      `**User permissions:** ${userPermissions}`,
      `**Bot permissions:** ${botPermissions}`
    ].join('\n')));

  if (flags.length) {
    container
      .addSeparatorComponents(separator())
      .addTextDisplayComponents(textDisplay([
        `## Flags`,
        flags.join('\n')
      ].join('\n')));
  }

  const shouldPaginate = !forceNoNavigation && result.pageCount > 1;
  const nav = shouldPaginate
    ? navRow(ownerId, sessionId, result.currentPage, result.pageCount)
    : null;

  if (nav) {
    container
      .addSeparatorComponents(separator())
      .addActionRowComponents(nav);
  }

  container
    .addSeparatorComponents(separator({ divider: false }))
    .addTextDisplayComponents(textDisplay(
      `${entryTypeLabel(entry)} **${result.currentPage}/${result.pageCount}** • Module: \`${module}\` • Requested by **${author.name}**`
    ));

  return makeV2Payload([container]);
}

function buildCommandListPayload({
  title,
  subtitle,
  entries,
  prefix,
  sessionId,
  page,
  ownerId,
  author,
  accentColor = COLORS.ice
}) {
  const cleanEntries = dedupeEntries(entries);
  if (!cleanEntries.length) return null;

  const result = pageSlice(cleanEntries, page, COMMANDS_PER_PAGE);

  const commandLines = result.slice.map((entry, index) => {
    const absolute = (result.currentPage - 1) * COMMANDS_PER_PAGE + index + 1;
    return commandLine(prefix, entry, absolute);
  });

  const container = new ContainerBuilder()
    .setAccentColor(accentColor)
    .addTextDisplayComponents(textDisplay([
      `# ${withIcon('list', title)}`,
      subtitle,
      '',
      `Showing **${result.slice.length}** of **${cleanEntries.length}** results.`
    ].join('\n')))
    .addSeparatorComponents(separator({ large: true }))
    .addTextDisplayComponents(textDisplay(commandLines.join('\n\n')))
    .addSeparatorComponents(separator())
    .addTextDisplayComponents(textDisplay([
      `Use \`${prefix}help <command>\` for full syntax, examples, permissions, and flags.`,
      `Requested by **${author.name}**`
    ].join('\n')));

  const nav = navRow(ownerId, sessionId, result.currentPage, result.pageCount);
  if (nav) container.addActionRowComponents(nav);

  container
    .addSeparatorComponents(separator({ divider: false }))
    .addTextDisplayComponents(textDisplay(`Page **${result.currentPage}/${result.pageCount}**`));

  return makeV2Payload([container]);
}

function buildQueryPayload({ catalog, prefix, query, page, ownerId, author, sessionId }) {
  const entries = dedupeEntries(catalog.entries || []);
  const cleanQuery = lower(query);
  const tokens = cleanQuery.split(/\s+/).filter(Boolean);

  if (!tokens.length) return null;

  const exact = entries.find((entry) => lower(entry.fullName) === cleanQuery);

  if (exact) {
    return buildCommandDetailPayload({
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

  const baseEntry = findBaseCommandEntry(entries, tokens[0]);

  if (baseEntry) {
    if (tokens.length > 1) {
      const subQuery = tokens.slice(1).join(' ');
      const exactMultiWord = entries.find((entry) => lower(entry.fullName) === cleanQuery);

      if (exactMultiWord && exactMultiWord.type !== 'command') {
        return buildCommandDetailPayload({
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
        return buildCommandDetailPayload({
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

    if (commandEntries.length > 1) {
      return buildCommandListPayload({
        title: `${baseEntry.name} subcommands`,
        subtitle: baseEntry.description || 'Browse this command group.',
        entries: commandEntries,
        prefix,
        sessionId,
        page,
        ownerId,
        author,
        accentColor: COLORS.ice
      });
    }

    return buildCommandDetailPayload({
      entries: commandEntries,
      prefix,
      sessionId,
      page,
      ownerId,
      author,
      moduleName: baseEntry.category,
      forceNoNavigation: true
    });
  }

  const categoryEntries = entriesForCategory(entries, cleanQuery);

  if (categoryEntries.length) {
    return buildCommandListPayload({
      title: `${cleanQuery} module`,
      subtitle: `Browse commands in the \`${cleanQuery}\` module.`,
      entries: categoryEntries,
      prefix,
      sessionId,
      page,
      ownerId,
      author,
      accentColor: COLORS.ice
    });
  }

  const directEntry = entries.find((entry) => entryMatchesName(entry, cleanQuery));

  if (directEntry) {
    return buildCommandDetailPayload({
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
    return buildCommandListPayload({
      title: `Search results`,
      subtitle: `Results matching \`${cleanQuery}\`.`,
      entries: searchResults,
      prefix,
      sessionId,
      page,
      ownerId,
      author,
      accentColor: COLORS.ice
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

  if (pageToken === 'page') {
    await interaction.reply({
      content: 'This button only shows the current page.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);

    return true;
  }

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

  await interaction.editReply(payload).catch(async () => {
    await interaction.message.edit(payload).catch(() => null);
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

    return message.channel.send(payload).catch(() =>
      respond.reply(message, 'bad', 'I could not send the help panel in this channel.')
    );
  },

  renderHelpPayload,
  handleHelpInteraction
};