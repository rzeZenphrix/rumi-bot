const { PermissionFlagsBits, WebhookClient } = require('discord.js');
const {
  getGuildCustomization,
  getGuildWebhook,
  setGuildWebhook
} = require('./customizationStore');

async function fetchSavedWebhook(channel, saved) {
  if (!saved?.id || !saved?.token) return null;

  try {
    const webhook = new WebhookClient({
      id: saved.id,
      token: saved.token
    });

    await webhook.fetch();

    return webhook;
  } catch {
    return null;
  }
}

async function createReplyWebhook(channel) {
  if (!channel?.guild) return null;

  const me = channel.guild.members.me;

  if (!me?.permissionsIn(channel).has(PermissionFlagsBits.ManageWebhooks)) {
    return null;
  }

  const webhook = await channel.createWebhook({
    name: 'Rumi Replies',
    avatar: channel.client.user.displayAvatarURL(),
    reason: 'Per-server bot customization reply webhook'
  });

  setGuildWebhook(channel.guild.id, channel.id, {
    id: webhook.id,
    token: webhook.token,
    url: webhook.url,
    channelId: channel.id
  });

  return webhook;
}

async function getReplyWebhook(channel) {
  if (!channel?.guild) return null;

  const saved = getGuildWebhook(channel.guild.id, channel.id);

  const existing = await fetchSavedWebhook(channel, saved);

  if (existing) return existing;

  return createReplyWebhook(channel);
}

async function sendWithGuildWebhook(channel, payload) {
  if (!channel?.guild) return null;

  const config = getGuildCustomization(channel.guild.id);

  if (config.replyMode !== 'webhook') return null;

  const webhook = await getReplyWebhook(channel);

  if (!webhook) return null;

  const username =
    config.botProfile?.username ||
    channel.client.user.username;

  const avatarURL =
    config.botProfile?.avatarUrl ||
    channel.client.user.displayAvatarURL();

  return webhook.send({
    ...payload,
    username,
    avatarURL
  });
}

module.exports = {
  getReplyWebhook,
  sendWithGuildWebhook
};