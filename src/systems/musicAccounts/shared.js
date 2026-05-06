const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const store = require('./store');

const PROVIDER_LABELS = {
  spotify: 'Spotify',
  lastfm: 'Last.fm'
};

function providerLabel(provider = '') {
  return PROVIDER_LABELS[String(provider || '').trim().toLowerCase()] || 'Music account';
}

function parseMentionOrId(value = '') {
  const text = String(value || '').trim();
  return text.match(/^<@!?(\d{15,22})>$/)?.[1] || text.match(/^(\d{15,22})$/)?.[1] || null;
}

async function resolveMemberByText(message, value = '') {
  const text = String(value || '').trim();
  if (!text) return null;

  const directId = parseMentionOrId(text);
  if (directId) {
    return message.guild?.members?.cache?.get(directId)
      || await message.guild?.members?.fetch?.(directId).catch(() => null)
      || null;
  }

  const lowered = text.toLowerCase();
  return message.guild?.members?.cache?.find?.((member) => {
    const username = String(member.user?.username || '').toLowerCase();
    const globalName = String(member.user?.globalName || member.user?.global_name || '').toLowerCase();
    const displayName = String(member.displayName || member.nickname || '').toLowerCase();
    return username === lowered || globalName === lowered || displayName === lowered;
  }) || null;
}

async function createLinkComponents(provider, discordUserId, options = {}) {
  const session = await store.createMusicLinkSession(provider, discordUserId, {
    source: options.source || 'bot',
    metadata: options.metadata || {}
  });

  return {
    session,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setLabel(options.label || `Connect ${providerLabel(provider)}`)
          .setURL(session.authorizeUrl)
      )
    ]
  };
}

module.exports = {
  providerLabel,
  parseMentionOrId,
  resolveMemberByText,
  createLinkComponents
};
