const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const respond = require('../../utils/respond');
const { VARIABLES } = require('../../systems/variables/variableRegistry');

const CATEGORY_ALIASES = {
  embeds: 'bot',
  guild: 'guild',
  user: 'user',
  moderation: 'member',
  admin: 'member',
  time: 'date',
  date: 'date',
  utility: 'channel',
  social: 'message'
};

function normalizeCategory(value) {
  const clean = String(value || '').trim().toLowerCase();
  return CATEGORY_ALIASES[clean] || clean;
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
  const currentPage = Math.min(page, pageCount);
  const slice = items.slice((currentPage - 1) * perPage, currentPage * perPage);
  return { slice, currentPage, pageCount };
}

function navRow(ownerId, query, page, pageCount) {
  if (pageCount <= 1) return null;
  const encoded = encodeURIComponent(query || '_all');

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`vars:${ownerId}:${Math.max(1, page - 1)}:${encoded}`)
      .setEmoji(emojis.prev)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`vars:${ownerId}:${Math.min(pageCount, page + 1)}:${encoded}`)
      .setEmoji(emojis.next)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= pageCount)
  );
}

function filterVariables(query) {
  const normalizedQuery = String(query || '').trim().toLowerCase();
  const category = normalizeCategory(normalizedQuery);

  return VARIABLES.filter((item) => {
    if (!normalizedQuery) return true;
    return item.category === category
      || item.name.includes(normalizedQuery)
      || item.syntax.toLowerCase().includes(normalizedQuery)
      || item.description.toLowerCase().includes(normalizedQuery);
  });
}

function buildVariablesPayload({ query = '', page = 1, ownerId, guildId = null }) {
  const filtered = filterVariables(query);
  if (!filtered.length) return null;

  const result = pageSlice(filtered, page, 6);
  const nav = navRow(ownerId, query, result.currentPage, result.pageCount);

  return {
    mentionUser: false,
    description: query
      ? `Showing matches for **${query}**.`
      : 'Showing available variables.',
    fields: result.slice.map((item) => ({
      name: item.syntax,
      value: `${item.description}${item.example ? `\nExample: ${item.example}` : ''}`,
      inline: false
    })),
    footer: {
      text: `Page ${result.currentPage}/${result.pageCount} (${filtered.length} variables)`
    },
    components: nav ? [nav] : [],
    guildId
  };
}

async function handleVariablesInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith('vars:')) return false;

  const [, ownerId, pageToken, encodedQuery] = interaction.customId.split(':');
  if (interaction.user.id !== ownerId) {
    await interaction.reply({ content: 'This variables panel belongs to someone else.', flags: MessageFlags.Ephemeral }).catch(() => null);
    return true;
  }

  const payload = buildVariablesPayload({
    query: decodeURIComponent(encodedQuery || '_all').replace(/^_all$/, ''),
    page: Math.max(1, Number(pageToken || 1)),
    ownerId,
    guildId: interaction.guildId
  });

  if (!payload) {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => null);
    }
    await interaction.message.edit({ content: 'I could not load that variables page anymore.', embeds: [], components: [] }).catch(() => null);
    return true;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  const built = respond.buildPayload('list', interaction.user, null, payload);
  await interaction.message.edit(built).catch(async () => {
    await interaction.editReply(built).catch(() => null);
  });
  return true;
}

module.exports = {
  name: 'variables',
  aliases: ['vars', 'embedvars'],
  category: 'utility',
  description: 'Shows bot and embed variables by category.',
  usage: 'variables [category|search] [page]',
  examples: ['variables', 'variables user', 'variables guild 2', 'variables vanity'],
  subcommands: [
    {
      name: 'user',
      aliases: ['member'],
      description: 'Show user and member variable tokens.',
      usage: 'variables user [page]',
      examples: ['variables user', 'variables member 2']
    },
    {
      name: 'guild',
      aliases: ['server'],
      description: 'Show guild variable tokens like vanity and tag.',
      usage: 'variables guild [page]',
      examples: ['variables guild', 'variables server 2']
    },
    {
      name: 'bot',
      aliases: ['embeds'],
      description: 'Show bot customization and embed variables.',
      usage: 'variables bot [page]',
      examples: ['variables bot', 'variables embeds']
    }
  ],

  async execute({ message, args }) {
    const parsed = parsePage(args);
    const query = parsed.tokens.join(' ').trim().toLowerCase();
    const payload = buildVariablesPayload({
      query,
      page: parsed.page,
      ownerId: message.author.id,
      guildId: message.guild?.id
    });

    if (!payload) {
      return respond.reply(message, 'info', 'I could not find any variables for that search.');
    }

    return respond.reply(message, 'list', null, payload);
  },

  handleVariablesInteraction
};
