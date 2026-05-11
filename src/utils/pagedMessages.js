const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const respond = require('./respond');
const {
  createSession,
  getSession,
  updateSession,
  deleteSession
} = require('./interactionSessions');

const SESSION_PREFIX = 'page';

function buildNavRow(session, pageIndex) {
  if ((session.pages?.length || 0) <= 1) return null;

  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${SESSION_PREFIX}:${session.id}:prev`)
      .setLabel('')
      .setEmoji('<:prev:1503313064282296431>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex <= 0),
    new ButtonBuilder()
      .setCustomId(`${SESSION_PREFIX}:${session.id}:next`)
      .setLabel('nxt')
      .setEmoji('<:next:1503313066144829440>')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex >= session.pages.length - 1)
  );
}

function buildPageOptions(session, pageIndex) {
  const current = session.pages[pageIndex] || session.pages[0] || {};
  const navRow = buildNavRow(session, pageIndex);

  return {
    ...current,
    guildId: session.guildId,
    mentionUser: current.mentionUser ?? false,
    components: [
      ...(current.components || []),
      ...(navRow ? [navRow] : [])
    ]
  };
}

function createPagedMessage({
  prefix,
  ownerId,
  guildId = null,
  pages = [],
  type = 'info',
  ttlMs = 15 * 60 * 1000,
  initialPage = 0
}) {
  const safePages = Array.isArray(pages) ? pages.filter(Boolean) : [];
  if (!safePages.length) return null;

  const id = createSession(SESSION_PREFIX, {
    prefix,
    ownerId,
    guildId,
    type,
    pages: safePages,
    pageIndex: Math.max(0, Math.min(initialPage, safePages.length - 1))
  }, ttlMs);

  const session = getSession(SESSION_PREFIX, id);
  return buildPageOptions(session, session.pageIndex);
}

async function handlePagedMessageInteraction(interaction) {
  if (!interaction.isButton() || !interaction.customId.startsWith(`${SESSION_PREFIX}:`)) {
    return false;
  }

  const [, sessionId, action] = interaction.customId.split(':');
  const session = getSession(SESSION_PREFIX, sessionId);

  if (!session) {
    await interaction.reply({
      content: 'That panel expired. Run the command again for a fresh view.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  if (interaction.user.id !== session.ownerId) {
    await interaction.reply({
      content: 'That panel belongs to someone else.',
      flags: MessageFlags.Ephemeral
    }).catch(() => null);
    return true;
  }

  let nextPage = session.pageIndex || 0;
  if (action === 'prev') nextPage = Math.max(0, nextPage - 1);
  if (action === 'next') nextPage = Math.min(session.pages.length - 1, nextPage + 1);
  if (action === 'close') {
    deleteSession(SESSION_PREFIX, sessionId);
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate().catch(() => null);
    }
    await interaction.message.edit({ components: [] }).catch(() => null);
    return true;
  }

  const updated = updateSession(SESSION_PREFIX, sessionId, { pageIndex: nextPage }) || session;
  const payload = respond.buildPayload(
    updated.type || 'info',
    interaction.user,
    null,
    buildPageOptions(updated, nextPage)
  );

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferUpdate().catch(() => null);
  }

  await interaction.message.edit(payload).catch(async () => {
    await interaction.editReply(payload).catch(() => null);
  });

  return true;
}

module.exports = {
  createPagedMessage,
  handlePagedMessageInteraction
};
