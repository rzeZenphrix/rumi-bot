const { EmbedBuilder, WebhookClient } = require('discord.js');
const emojis = require('../../config/botEmojis');
const { getGuildLogConfig } = require('./logConfigStore');

const recent = new Map();
const EVENT_EMOJIS = {
  messageDelete: emojis.trash,
  messageUpdate: emojis.pencil,
  messageBulkDelete: emojis.broom,
  memberJoin: emojis.add,
  memberLeave: emojis.remove,
  memberUpdate: emojis.user,
  memberBan: emojis.kick,
  memberUnban: emojis.unlock,
  roleCreate: emojis.role,
  roleDelete: emojis.role,
  roleUpdate: emojis.role,
  channelCreate: emojis.hashtag,
  channelDelete: emojis.hashtag,
  channelUpdate: emojis.hashtag,
  emojiCreate: emojis.stars,
  emojiDelete: emojis.stars,
  emojiUpdate: emojis.stars,
  stickerCreate: emojis.documents,
  stickerDelete: emojis.documents,
  stickerUpdate: emojis.documents,
  inviteCreate: emojis.link,
  inviteDelete: emojis.link,
  webhookUpdate: emojis.link,
  guildUpdate: emojis.crown,
  threadCreate: emojis.chat,
  threadDelete: emojis.chat,
  threadUpdate: emojis.chat,
  voiceStateUpdate: emojis.mute,
  hardbanReapply: emojis.lock,
  antinukeAction: emojis.shield,
  automodAction: emojis.alert,
  moderationAction: emojis.gear
};

function parseHexColor(value, fallback = 0x2b2d31) {
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
  return { webhook: config.webhooks[eventType] || config.webhooks.all, channelId: config.channels[eventType] || config.channels.all };
}
function normalizeField(field) {
  if (!field || !field.name) return null;
  return { name: String(field.name).slice(0, 256), value: String(field.value ?? 'Unknown').slice(0, 1024) || 'Unknown', inline: Boolean(field.inline) };
}
function eventLabel(eventType) { return String(eventType || 'event').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()); }
function makeDedupeKey(guild, eventType, payload) {
  return [guild.id, eventType, payload.targetId, payload.userId, payload.channelId, payload.messageId, payload.title].filter(Boolean).join(':');
}
function shouldSkipDuplicate(key) {
  const now = Date.now();
  const last = recent.get(key) || 0;
  recent.set(key, now);
  for (const [k, t] of recent) if (now - t > 5000) recent.delete(k);
  return now - last < 1200;
}
function buildLogEmbed(guild, eventType, payload, config) {
  const icon = payload.emoji || EVENT_EMOJIS[eventType] || emojis.info || 'ℹ️';
  const color = parseHexColor(config.colors[eventType] || config.colors.all, payload.color || 0x2b2d31);
  const at = `<t:${Math.floor(Date.now() / 1000)}:F>`;
  const description = [
    `**${icon} ${payload.title || eventLabel(eventType)}**`,
    String(payload.description || 'A server event was recorded.').slice(0, 2600),
    '',
    `**Event:** \`${eventType}\``,
    `**Server:** ${guild.name} (\`${guild.id}\`)`,
    `**Logged:** ${at}`
  ].join('\n');
  const embed = new EmbedBuilder().setColor(color).setDescription(description.slice(0, 4096));
  const fields = [
    ...(payload.fields || []),
    payload.actorId ? { name: 'Executor / actor', value: `<@${payload.actorId}>\n\`${payload.actorId}\``, inline: true } : null,
    payload.userId ? { name: 'User', value: `<@${payload.userId}>\n\`${payload.userId}\``, inline: true } : null,
    payload.targetId ? { name: 'Target ID', value: `\`${payload.targetId}\``, inline: true } : null,
    payload.channelId ? { name: 'Channel', value: `<#${payload.channelId}>\n\`${payload.channelId}\``, inline: true } : null,
    payload.messageId ? { name: 'Message ID', value: `\`${payload.messageId}\``, inline: true } : null
  ].map(normalizeField).filter(Boolean).slice(0, 25);
  if (fields.length) embed.addFields(fields);
  if (payload.thumbnail) embed.setThumbnail(payload.thumbnail);
  if (payload.image) embed.setImage(payload.image);
  return embed;
}
async function sendLog(guild, eventType, payload = {}) {
  const config = getGuildLogConfig(guild.id);
  if (!config.enabled) return null;
  if (isIgnored(config, payload)) return null;
  const key = makeDedupeKey(guild, eventType, payload);
  if (shouldSkipDuplicate(key)) return null;
  const route = resolveRoute(config, eventType);
  if (!route.channelId && !route.webhook?.url) return null;
  const embed = buildLogEmbed(guild, eventType, payload, config);
  const files = Array.isArray(payload.files) ? payload.files : [];
  const sendPayload = { username: 'Rumi Logs', avatarURL: guild.client.user?.displayAvatarURL?.() || undefined, embeds: [embed], files, allowedMentions: { parse: [] } };
  if (route.webhook?.url) {
    const webhook = new WebhookClient({ url: route.webhook.url });
    return webhook.send(sendPayload).catch(async () => {
      const channel = guild.channels.cache.get(route.channelId) || await guild.channels.fetch(route.channelId).catch(() => null);
      return channel?.send?.({ embeds: [embed], files, allowedMentions: { parse: [] } }).catch(() => null);
    });
  }
  const channel = guild.channels.cache.get(route.channelId) || await guild.channels.fetch(route.channelId).catch(() => null);
  if (!channel?.send) return null;
  return channel.send({ embeds: [embed], files, allowedMentions: { parse: [] } }).catch(() => null);
}
module.exports = { sendLog };
