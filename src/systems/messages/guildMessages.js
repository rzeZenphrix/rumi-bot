const { EmbedBuilder } = require('discord.js');
const db = require('../../services/database');
const { resolveVariables } = require('../variables/variableRegistry');

const stickyRuntime = new Map();

const DEFAULT_MESSAGES_CONFIG = Object.freeze({
  welcome: {
    enabled: false,
    channelId: null,
    message: 'Welcome {user.mention} to {guild.name}.',
    embed: '',
    deleteDelaySeconds: 0
  },
  leave: {
    enabled: false,
    channelId: null,
    message: '{user.tag} left {guild.name}.',
    embed: '',
    deleteDelaySeconds: 0
  },
  dm: {
    enabled: false,
    message: 'Welcome to {guild.name}.',
    embed: ''
  },
  ping: {
    enabled: false,
    targets: [],
    deleteDelaySeconds: 0
  },
  sticky: [],
  system: {
    enabled: false,
    channelId: null,
    dmToggle: false,
    templates: {
      ban: '',
      kick: '',
      warn: '',
      timeout: '',
      roleAdd: '',
      roleRemove: '',
      staffStrip: '',
      roleReceive: '',
      roleLost: ''
    }
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function normalizeDelay(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(86400, Math.round(parsed));
}

function normalizeTargets(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => String(entry || '').trim()).filter(Boolean))];
}

function normalizeStickyEntry(entry = {}, index = 0) {
  const id = String(entry.id || `sticky_${Date.now()}_${index}`).trim();
  const mode = entry.mode === 'time' ? 'time' : 'messages';
  const interval = Number(entry.interval);
  return {
    id,
    channelId: String(entry.channelId || '').trim() || null,
    message: String(entry.message || '').trim(),
    embed: String(entry.embed || '').trim(),
    mode,
    interval: Number.isFinite(interval) && interval > 0 ? Math.round(interval) : 5,
    createdBy: entry.createdBy ? String(entry.createdBy) : null
  };
}

function normalizeMessagesConfig(value = {}) {
  const next = clone(DEFAULT_MESSAGES_CONFIG);
  const input = value || {};

  for (const key of ['welcome', 'leave', 'dm', 'ping', 'system']) {
    if (input[key] && typeof input[key] === 'object') {
      next[key] = {
        ...next[key],
        ...input[key]
      };
    }
  }

  next.welcome.enabled = next.welcome.enabled === true;
  next.welcome.channelId = String(next.welcome.channelId || '').trim() || null;
  next.welcome.message = String(next.welcome.message || DEFAULT_MESSAGES_CONFIG.welcome.message);
  next.welcome.embed = String(next.welcome.embed || '');
  next.welcome.deleteDelaySeconds = normalizeDelay(next.welcome.deleteDelaySeconds);

  next.leave.enabled = next.leave.enabled === true;
  next.leave.channelId = String(next.leave.channelId || '').trim() || null;
  next.leave.message = String(next.leave.message || DEFAULT_MESSAGES_CONFIG.leave.message);
  next.leave.embed = String(next.leave.embed || '');
  next.leave.deleteDelaySeconds = normalizeDelay(next.leave.deleteDelaySeconds);

  next.dm.enabled = next.dm.enabled === true;
  next.dm.message = String(next.dm.message || DEFAULT_MESSAGES_CONFIG.dm.message);
  next.dm.embed = String(next.dm.embed || '');

  next.ping.enabled = next.ping.enabled === true;
  next.ping.targets = normalizeTargets(next.ping.targets);
  next.ping.deleteDelaySeconds = normalizeDelay(next.ping.deleteDelaySeconds);

  next.sticky = Array.isArray(input.sticky)
    ? input.sticky.map((entry, index) => normalizeStickyEntry(entry, index))
    : [];

  next.system.enabled = next.system.enabled === true;
  next.system.channelId = String(next.system.channelId || '').trim() || null;
  next.system.dmToggle = next.system.dmToggle === true;
  next.system.templates = {
    ...DEFAULT_MESSAGES_CONFIG.system.templates,
    ...(next.system.templates || {})
  };

  for (const [key, template] of Object.entries(next.system.templates)) {
    next.system.templates[key] = String(template || '');
  }

  return next;
}

function buildSyntheticMessage({ guild, channel, user, member, sourceMessage = null }) {
  if (sourceMessage) return sourceMessage;

  return {
    id: `synthetic_${Date.now()}`,
    content: '',
    url: '',
    author: user,
    member,
    guild,
    channel
  };
}

async function renderTemplate(template, context) {
  if (!template) return '';
  return resolveVariables(template, context);
}

function buildEmbed(content, user) {
  if (!content) return null;
  return new EmbedBuilder()
    .setDescription(content)
    .setColor(0xF4A7B9)
    .setThumbnail(user?.displayAvatarURL?.({ size: 256 }) || null);
}

async function sendConfiguredPayload(channel, baseText, embedText, context, deleteDelaySeconds = 0) {
  if (!channel) return null;
  const content = await renderTemplate(baseText, context);
  const embedContent = await renderTemplate(embedText, context);
  if (!content && !embedContent) return null;

  const payload = {
    allowedMentions: { parse: ['users', 'roles'] }
  };

  if (content) payload.content = content.slice(0, 2000);
  if (embedContent) {
    payload.embeds = [buildEmbed(embedContent.slice(0, 4096), context.message.author)];
  }

  const sent = await channel.send(payload).catch(() => null);
  if (sent && deleteDelaySeconds > 0) {
    setTimeout(() => {
      sent.delete().catch(() => null);
    }, deleteDelaySeconds * 1000);
  }
  return sent;
}

async function getGuildMessagesConfig(guildId) {
  const settings = await db.getGuildSettings(guildId);
  return normalizeMessagesConfig(settings.settings_json?.messages || {});
}

async function updateGuildMessagesConfig(guildId, updater) {
  const settings = await db.getGuildSettings(guildId);
  const current = normalizeMessagesConfig(settings.settings_json?.messages || {});
  const next = normalizeMessagesConfig(typeof updater === 'function' ? updater(clone(current)) : updater);
  await db.updateGuildSettings(guildId, {
    settings_json: {
      ...(settings.settings_json || {}),
      messages: next
    }
  });
  return next;
}

async function previewMessagesTemplate(message, template, embedTemplate = '') {
  const synthetic = buildSyntheticMessage({
    guild: message.guild,
    channel: message.channel,
    user: message.author,
    member: message.member,
    sourceMessage: message
  });
  const context = {
    client: message.client,
    message: synthetic,
    args: [],
    prefix: message.prefix || ','
  };
  const content = await renderTemplate(template, context);
  const embedContent = await renderTemplate(embedTemplate, context);
  return {
    content,
    embedContent
  };
}

async function sendJoinMessages(member) {
  const config = await getGuildMessagesConfig(member.guild.id);
  const welcomeChannel = config.welcome.channelId
    ? member.guild.channels.cache.get(config.welcome.channelId) || await member.guild.channels.fetch(config.welcome.channelId).catch(() => null)
    : null;
  const messageContext = buildSyntheticMessage({
    guild: member.guild,
    channel: welcomeChannel,
    user: member.user,
    member
  });
  const context = { client: member.client, message: messageContext, args: [], prefix: member.guild.prefix || ',' };

  if (config.welcome.enabled && welcomeChannel?.isTextBased?.()) {
    await sendConfiguredPayload(
      welcomeChannel,
      config.welcome.message,
      config.welcome.embed,
      context,
      config.welcome.deleteDelaySeconds
    );
  }

  if (config.ping.enabled && welcomeChannel?.isTextBased?.() && config.ping.targets.length) {
    const pingText = `${config.ping.targets.join(' ')} ${await renderTemplate(config.welcome.message, context)}`.trim();
    const sent = await welcomeChannel.send({
      content: pingText.slice(0, 2000),
      allowedMentions: { parse: ['users', 'roles'] }
    }).catch(() => null);
    if (sent && config.ping.deleteDelaySeconds > 0) {
      setTimeout(() => sent.delete().catch(() => null), config.ping.deleteDelaySeconds * 1000);
    }
  }

  if (config.dm.enabled) {
    await sendConfiguredPayload(
      member,
      config.dm.message,
      config.dm.embed,
      context,
      0
    ).catch(() => null);
  }
}

async function sendLeaveMessages(member) {
  const config = await getGuildMessagesConfig(member.guild.id);
  if (!config.leave.enabled || !config.leave.channelId) return;
  const leaveChannel = member.guild.channels.cache.get(config.leave.channelId)
    || await member.guild.channels.fetch(config.leave.channelId).catch(() => null);
  if (!leaveChannel?.isTextBased?.()) return;

  const messageContext = buildSyntheticMessage({
    guild: member.guild,
    channel: leaveChannel,
    user: member.user,
    member
  });
  const context = { client: member.client, message: messageContext, args: [], prefix: member.guild.prefix || ',' };
  await sendConfiguredPayload(
    leaveChannel,
    config.leave.message,
    config.leave.embed,
    context,
    config.leave.deleteDelaySeconds
  );
}

async function handleStickyMessages(message) {
  const config = await getGuildMessagesConfig(message.guild.id);
  if (!config.sticky.length) return;

  for (const sticky of config.sticky) {
    if (!sticky.channelId || sticky.channelId !== message.channel.id) continue;
    const key = `${message.guild.id}:${sticky.channelId}:${sticky.id}`;
    const current = stickyRuntime.get(key) || {
      count: 0,
      lastSentAt: 0
    };

    current.count += 1;
    const now = Date.now();
    const shouldSend = sticky.mode === 'time'
      ? now - current.lastSentAt >= sticky.interval * 1000
      : current.count >= sticky.interval;

    if (!shouldSend) {
      stickyRuntime.set(key, current);
      continue;
    }

    const context = {
      client: message.client,
      message,
      args: [],
      prefix: message.prefix || ','
    };
    const sent = await sendConfiguredPayload(message.channel, sticky.message, sticky.embed, context, 0);
    if (sent) {
      current.count = 0;
      current.lastSentAt = now;
    }
    stickyRuntime.set(key, current);
  }
}

module.exports = {
  DEFAULT_MESSAGES_CONFIG,
  normalizeMessagesConfig,
  getGuildMessagesConfig,
  updateGuildMessagesConfig,
  previewMessagesTemplate,
  sendJoinMessages,
  sendLeaveMessages,
  handleStickyMessages
};
