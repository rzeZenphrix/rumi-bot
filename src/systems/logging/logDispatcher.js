const { EmbedBuilder, WebhookClient } = require('discord.js');
const emojis = require('../../utils/botEmojis');
const respond = require('../../utils/respond');
const { getGuildLogConfig } = require('./logConfigStore');

const EVENT_EMOJIS = {};

function parseHexColor(value, fallback = respond.DEFAULT_EMBED_COLOR) {
  const raw = String(value || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(raw)) return fallback;
  return Number.parseInt(raw, 16);
}

function isIgnored(config, payload = {}) {
  if (payload.channelId && config.ignores.channels.includes(payload.channelId)) return true;
  if (payload.userId && config.ignores.users.includes(payload.userId)) return true;
  if (payload.actorId && config.ignores.users.includes(payload.actorId)) return true;
  if (payload.member?.roles?.cache?.some((role) => config.ignores.roles.includes(role.id))) return true;
  return false;
}

function resolveRoute(config, eventType) {
  return {
    webhook: config.webhooks[eventType] || config.webhooks.all,
    channelId: config.channels[eventType] || config.channels.all
  };
}

function normalizeField(field) {
  if (!field || !field.name) return null;
  return {
    name: String(field.name).slice(0, 256),
    value: String(field.value ?? 'Unknown').slice(0, 1024) || 'Unknown',
    inline: Boolean(field.inline)
  };
}

function eventLabel(eventType) {
  return String(eventType || 'event')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase());
}

function buildLogEmbed(guild, eventType, payload, config) {
  const icon = payload.emoji || EVENT_EMOJIS[eventType] || emojis.info;
  const color = parseHexColor(config.colors[eventType] || config.colors.all, payload.color || respond.DEFAULT_EMBED_COLOR);
  const header = `**${icon} ${payload.title || eventLabel(eventType)}**`;
  const desc = payload.description ? String(payload.description).slice(0, 3800) : 'I recorded this server event.';
  const at = `<t:${Math.floor(Date.now() / 1000)}:F>`;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`${header}\n${desc}\n\n**Event:** \`${eventType}\`\n**Logged:** ${at}`.slice(0, 4096));

  const fields = [
    ...(payload.fields || []),
    { name: 'Server', value: `${guild.name}\n\`${guild.id}\``, inline: true }
  ]
    .map(normalizeField)
    .filter(Boolean)
    .slice(0, 25);

  if (fields.length) embed.addFields(fields);
  if (payload.thumbnail) embed.setThumbnail(payload.thumbnail);
  if (payload.image) embed.setImage(payload.image);

  // Minimalistic logging policy: no title, footer, or timestamp.
  return embed;
}

async function sendLog(guild, eventType, payload = {}) {
  const config = await getGuildLogConfig(guild.id);
  if (!config.enabled) return null;
  if (isIgnored(config, payload)) return null;

  const route = resolveRoute(config, eventType);
  if (!route.channelId && !route.webhook?.url) return null;

  const embed = buildLogEmbed(guild, eventType, payload, config);
  const sendPayload = {
    username: 'Rumi Logs',
    avatarURL: guild.client.user?.displayAvatarURL?.() || undefined,
    embeds: [embed],
    files: payload.files || [],
    allowedMentions: { parse: [] }
  };

  if (route.webhook?.url) {
    const webhook = new WebhookClient({ url: route.webhook.url });
    return webhook.send(sendPayload).catch(async () => {
      const channel = guild.channels.cache.get(route.channelId) || await guild.channels.fetch(route.channelId).catch(() => null);
      return channel?.send?.({ embeds: [embed], files: payload.files || [], allowedMentions: { parse: [] } }).catch(() => null);
    });
  }

  const channel = guild.channels.cache.get(route.channelId) || await guild.channels.fetch(route.channelId).catch(() => null);
  if (!channel?.send) return null;
  return channel.send({ embeds: [embed], files: payload.files || [], allowedMentions: { parse: [] } }).catch(() => null);
}

module.exports = { sendLog };
