const crypto = require('node:crypto');
const { 
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  MessageFlags
 } = require('discord.js');

const db = require('../../services/database');
const logger = require('../logging/logger');
const {
  getProtectionSettings,
  updateProtectionSection
} = require('../security/protectionConfig');

const DEFAULT_VERIFICATION = {
  enabled: false,
  mode: 'captcha',

  unverifiedRoleId: null,
  verifiedRoleId: null,

  verifyChannelId: null,
  verifyMessageId: null,

  reactionEmojiId: null,
  reactionEmojiName: null,

  captchaExpiresMinutes: 10,
  captchaMaxAttempts: 3,

  assignUnverifiedOnJoin: true,
  removeUnverifiedOnVerify: true,

  // Strict gate:
  // When true, @everyone is denied ViewChannel and verified is allowed.
  // Existing members are given verified during setup so they do not lose access.
  strictGate: true
};

function normalizeVerificationConfig(value = {}) {
  const input = value && typeof value === 'object' ? value : {};
  const mode = String(input.mode || 'captcha').toLowerCase();

  return {
    ...DEFAULT_VERIFICATION,
    ...input,

    enabled: input.enabled === true,
    mode: ['captcha', 'reaction'].includes(mode) ? mode : 'captcha',

    unverifiedRoleId: input.unverifiedRoleId || null,
    verifiedRoleId: input.verifiedRoleId || input.roleId || null,

    verifyChannelId: input.verifyChannelId || input.channelId || null,
    verifyMessageId: input.verifyMessageId || null,

    reactionEmojiId: input.reactionEmojiId || null,
    reactionEmojiName: input.reactionEmojiName || null,

    captchaExpiresMinutes: Math.max(1, Math.min(60, Number(input.captchaExpiresMinutes || 10))),
    captchaMaxAttempts: Math.max(1, Math.min(10, Number(input.captchaMaxAttempts || 3))),

    assignUnverifiedOnJoin: input.assignUnverifiedOnJoin !== false,
    removeUnverifiedOnVerify: input.removeUnverifiedOnVerify !== false,
    strictGate: input.strictGate !== false,

    // legacy compatibility
    roleId: input.verifiedRoleId || input.roleId || null,
    channelId: input.verifyChannelId || input.channelId || null
  };
}

async function getVerificationConfig(guildId) {
  const protection = await getProtectionSettings(guildId).catch(() => null);
  return normalizeVerificationConfig(protection?.verification || {});
}

async function saveVerificationConfig(guildId, updater) {
  const saved = await updateProtectionSection(guildId, 'verification', (current) => {
    const normalized = normalizeVerificationConfig(current || {});
    const next = typeof updater === 'function' ? updater(normalized) : updater;
    return normalizeVerificationConfig(next || {});
  });

  return normalizeVerificationConfig(saved || {});
}

function hashAnswer(answer, salt) {
  return crypto
    .createHash('sha256')
    .update(`${salt}:${String(answer || '').trim().toUpperCase()}`)
    .digest('hex');
}

function randomCaptchaCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let output = '';

  for (let i = 0; i < 6; i += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return output;
}

function parseEmojiId(input = '') {
  return String(input || '').match(/\d{15,25}/)?.[0] || null;
}

function resolveServerEmoji(guild, input = '') {
  const raw = String(input || '').trim();
  const id = parseEmojiId(raw);

  if (id) {
    return guild.emojis.cache.get(id) || null;
  }

  const name = raw.replace(/:/g, '').toLowerCase();

  return guild.emojis.cache.find((emoji) =>
    emoji.name.toLowerCase() === name
  ) || null;
}

async function ensureRole(guild, name, options = {}) {
  const existing = guild.roles.cache.find((role) =>
    role.name.toLowerCase() === name.toLowerCase()
  );

  if (existing) return existing;

  const payload = {
    name,
    permissions: [],
    reason: 'Rumi verification setup'
  };

  if (options.color) {
    payload.colors = {
      primaryColor: options.color
    };
  }

  return guild.roles.create(payload);
}

function isTextLike(channel) {
  return [
    ChannelType.GuildText,
    ChannelType.GuildAnnouncement,
    ChannelType.GuildForum,
    ChannelType.GuildMedia,
    ChannelType.GuildVoice,
    ChannelType.GuildStageVoice
  ].includes(channel.type);
}

function isManageableChannel(channel) {
  return Boolean(channel?.guild && channel?.permissionOverwrites?.edit);
}

function canManageChannel(guild, channel) {
  const me = guild.members.me;
  if (!me || !channel?.permissionsFor) return false;

  return channel.permissionsFor(me).has(PermissionFlagsBits.ManageChannels);
}

async function applyVerificationOverwrite(channel, config, isVerifyChannel = false) {
  if (!isManageableChannel(channel)) {
    return {
      ok: false,
      channelId: channel?.id,
      reason: 'Not a manageable guild channel/category.'
    };
  }

  const guild = channel.guild;

  if (!canManageChannel(guild, channel)) {
    return {
      ok: false,
      channelId: channel.id,
      reason: 'Missing Manage Channels.'
    };
  }

  const unverifiedRole = config.unverifiedRoleId
    ? guild.roles.cache.get(config.unverifiedRoleId)
    : null;

  const verifiedRole = config.verifiedRoleId
    ? guild.roles.cache.get(config.verifiedRoleId)
    : null;

  const jobs = [];

  /**
   * Strict gate:
   * @everyone cannot see normal server channels.
   * verified can see them.
   * unverified cannot see them.
   *
   * In #verify:
   * @everyone cannot see.
   * unverified can see and react/click buttons.
   * verified can also see unless you later choose to hide it.
   */
  if (config.strictGate) {
    jobs.push(
      channel.permissionOverwrites.edit(
        guild.roles.everyone,
        {
          ViewChannel: false
        },
        {
          reason: 'Rumi verification gate: hide from everyone'
        }
      )
    );
  }

  if (unverifiedRole) {
    const unverifiedOverwrite = isVerifyChannel
      ? {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: false,
          AddReactions: true
        }
      : {
          ViewChannel: false,
          SendMessages: false,
          AddReactions: false
        };

    jobs.push(
      channel.permissionOverwrites.edit(
        unverifiedRole,
        unverifiedOverwrite,
        {
          reason: 'Rumi verification gate: unverified permissions'
        }
      )
    );
  }

  if (verifiedRole) {
    jobs.push(
      channel.permissionOverwrites.edit(
        verifiedRole,
        {
          ViewChannel: true,
          ReadMessageHistory: true
        },
        {
          reason: 'Rumi verification gate: verified permissions'
        }
      )
    );
  }

  const settled = await Promise.allSettled(jobs);

  const failed = settled
    .filter((item) => item.status === 'rejected')
    .map((item) => item.reason?.message || String(item.reason));

  return {
    ok: failed.length === 0,
    channelId: channel.id,
    reason: failed.length ? failed.join('; ') : 'Permissions applied.'
  };
}

async function applyVerificationOverwrites(guild, config) {
  const results = [];

  for (const channel of guild.channels.cache.values()) {
    if (!isManageableChannel(channel)) continue;

    const isVerifyChannel = channel.id === config.verifyChannelId;

    const result = await applyVerificationOverwrite(channel, config, isVerifyChannel)
      .catch((error) => ({
        ok: false,
        channelId: channel.id,
        reason: error.message
      }));

    results.push(result);
  }

  return results;
}

async function applyVerificationToNewChannel(channel) {
  if (!channel?.guild) return null;

  const config = await getVerificationConfig(channel.guild.id);
  if (!config.enabled) return null;

  return applyVerificationOverwrite(
    channel,
    config,
    channel.id === config.verifyChannelId
  ).catch((error) => {
    logger.warn(
      {
        error,
        guildId: channel.guild.id,
        channelId: channel.id
      },
      'Could not apply verification permissions to new channel'
    );

    return null;
  });
}

function verificationEmbed(config) {
  if (config.mode === 'reaction') {
    const emojiText = config.reactionEmojiId && config.reactionEmojiName
      ? `<:${config.reactionEmojiName}:${config.reactionEmojiId}>`
      : 'the reaction below';

    return new EmbedBuilder()
      .setTitle('Verify to Access the Server')
      .setDescription(`React with ${emojiText} to verify and unlock the server.`)
      .setColor(0x57F287);
  }

  return new EmbedBuilder()
    .setTitle('Verify to Access the Server')
    .setDescription([
      'Click **Captcha** to receive your private captcha.',
      'Then click **Verify** and type the captcha exactly as shown.'
    ].join('\n'))
    .setColor(0x5865F2);
}

function captchaRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('verification:captcha')
        .setLabel('Captcha')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('verification:verify')
        .setLabel('Verify')
        .setStyle(ButtonStyle.Success)
    )
  ];
}

async function ensureVerifyChannel(guild, config) {
  let channel = config.verifyChannelId
    ? guild.channels.cache.get(config.verifyChannelId)
    : null;

  if (channel) return channel;

  channel = guild.channels.cache.find((item) =>
    item.name === 'verify' &&
    item.type === ChannelType.GuildText
  ) || null;

  if (channel) return channel;

  return guild.channels.create({
    name: 'verify',
    type: ChannelType.GuildText,
    reason: 'Rumi verification setup'
  });
}

async function deletePreviousPanel(guild, config) {
  if (!config.verifyChannelId || !config.verifyMessageId) return null;

  const channel = guild.channels.cache.get(config.verifyChannelId) ||
    await guild.channels.fetch(config.verifyChannelId).catch(() => null);

  if (!channel?.messages?.fetch) return null;

  const oldMessage = await channel.messages.fetch(config.verifyMessageId).catch(() => null);

  if (!oldMessage) return null;

  await oldMessage.delete().catch(() => null);

  return oldMessage.id;
}

async function sendVerificationPanel(guild, config, options = {}) {
  const replace = options.replace === true;
  let fixedConfig = normalizeVerificationConfig(config || {});

  let channel = null;

  if (fixedConfig.verifyChannelId) {
    channel = guild.channels.cache.get(fixedConfig.verifyChannelId) ||
      await guild.channels.fetch(fixedConfig.verifyChannelId).catch(() => null);
  }

  if (!channel) {
    channel = await ensureVerifyChannel(guild, fixedConfig);
  }

  if (!channel?.send) {
    throw new Error('Verification channel exists but is not a text channel I can send messages in.');
  }

  fixedConfig = await saveVerificationConfig(guild.id, (current) => ({
    ...current,
    ...fixedConfig,
    verifyChannelId: channel.id,
    channelId: channel.id
  }));

  await applyVerificationOverwrite(channel, fixedConfig, true).catch(() => null);

  if (replace) {
    await deletePreviousPanel(guild, fixedConfig);
    fixedConfig.verifyMessageId = null;
  }

  const payload = {
    embeds: [verificationEmbed(fixedConfig)],
    components: fixedConfig.mode === 'captcha' ? captchaRows() : []
  };

  let message = null;

  if (!replace && fixedConfig.verifyMessageId) {
    message = await channel.messages.fetch(fixedConfig.verifyMessageId).catch(() => null);
  }

  if (message) {
    await message.edit(payload);
  } else {
    message = await channel.send(payload);
  }

  if (fixedConfig.mode === 'reaction') {
    const emoji = guild.emojis.cache.get(fixedConfig.reactionEmojiId);

    if (emoji) {
      await message.react(emoji).catch(() => null);
    }
  }

  await saveVerificationConfig(guild.id, (current) => ({
    ...current,
    verifyChannelId: channel.id,
    channelId: channel.id,
    verifyMessageId: message.id
  }));

  return message;
}

async function grantVerifiedToExistingMembers(guild, config) {
  if (!config.verifiedRoleId) {
    return {
      added: 0,
      failed: 0,
      skipped: 0
    };
  }

  const verifiedRole = guild.roles.cache.get(config.verifiedRoleId);

  if (!verifiedRole || !verifiedRole.editable) {
    return {
      added: 0,
      failed: 0,
      skipped: 0,
      reason: 'Verified role is missing or not editable.'
    };
  }

  const members = await guild.members.fetch().catch(() => guild.members.cache);

  let added = 0;
  let failed = 0;
  let skipped = 0;

  for (const member of members.values()) {
    if (member.user.bot) {
      skipped += 1;
      continue;
    }

    if (member.roles.cache.has(config.verifiedRoleId)) {
      skipped += 1;
      continue;
    }

    await member.roles.add(verifiedRole, 'Rumi verification setup: existing member access')
      .then(() => {
        added += 1;
      })
      .catch(() => {
        failed += 1;
      });
  }

  return {
    added,
    failed,
    skipped
  };
}

async function setupVerification(guild, options = {}) {
  const mode = ['captcha', 'reaction'].includes(String(options.mode || '').toLowerCase())
    ? String(options.mode).toLowerCase()
    : 'captcha';

  const unverifiedRole = await ensureRole(guild, 'unverified', {
    color: 0xED4245
  });

  const verifiedRole = await ensureRole(guild, 'verified', {
    color: 0x57F287
  });

  let reactionEmoji = null;

  if (mode === 'reaction') {
    reactionEmoji = resolveServerEmoji(guild, options.emoji);

    if (!reactionEmoji) {
      throw new Error('Reaction mode requires a custom emoji from this server.');
    }
  }

  let config = await getVerificationConfig(guild.id);
  const verifyChannel = await ensureVerifyChannel(guild, config);

  config = await saveVerificationConfig(guild.id, (current) => ({
    ...current,
    enabled: true,
    mode,

    unverifiedRoleId: unverifiedRole.id,
    verifiedRoleId: verifiedRole.id,

    roleId: verifiedRole.id,

    verifyChannelId: verifyChannel.id,
    channelId: verifyChannel.id,

    reactionEmojiId: reactionEmoji?.id || null,
    reactionEmojiName: reactionEmoji?.name || null
  }));

  const grantResult = await grantVerifiedToExistingMembers(guild, config);

  const overwriteResults = await applyVerificationOverwrites(guild, config);

  const panel = await sendVerificationPanel(guild, config, {
    replace: true
  });

  config = await saveVerificationConfig(guild.id, (current) => ({
    ...current,
    verifyChannelId: verifyChannel.id,
    channelId: verifyChannel.id,
    verifyMessageId: panel.id
  }));

  return {
    config,
    unverifiedRole,
    verifiedRole,
    verifyChannel,
    panel,
    reactionEmoji,
    grantResult,
    overwriteResults
  };
}

async function assignUnverifiedRole(member) {
  if (!member?.guild || member.user?.bot) return null;

  const config = await getVerificationConfig(member.guild.id);
  if (!config.enabled || !config.assignUnverifiedOnJoin || !config.unverifiedRoleId) return null;

  if (config.verifiedRoleId && member.roles.cache.has(config.verifiedRoleId)) return null;
  if (member.roles.cache.has(config.unverifiedRoleId)) return null;

  return member.roles.add(
    config.unverifiedRoleId,
    'Rumi verification: member joined unverified'
  ).catch((error) => {
    logger.warn(
      {
        error,
        guildId: member.guild.id,
        userId: member.id
      },
      'Could not assign unverified role'
    );

    return null;
  });
}

async function verifyMember(member, reason = 'Rumi verification completed') {
  const config = await getVerificationConfig(member.guild.id);

  if (!config.enabled) {
    return {
      ok: false,
      reason: 'Verification is not enabled.'
    };
  }

  const verifiedRole = config.verifiedRoleId
    ? member.guild.roles.cache.get(config.verifiedRoleId)
    : null;

  if (!verifiedRole) {
    return {
      ok: false,
      reason: 'Verified role is missing.'
    };
  }

  await member.roles.add(verifiedRole, reason);

  if (
    config.removeUnverifiedOnVerify &&
    config.unverifiedRoleId &&
    member.roles.cache.has(config.unverifiedRoleId)
  ) {
    await member.roles.remove(config.unverifiedRoleId, reason).catch(() => null);
  }

  await db.deleteVerificationCaptcha(member.guild.id, member.id).catch(() => null);

  return {
    ok: true,
    reason: 'Member verified.',
    verifiedRoleId: verifiedRole.id
  };
}

async function createCaptchaChallenge(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  const config = await getVerificationConfig(guild.id);
  if (!config.enabled || config.mode !== 'captcha') {
    return interaction.reply({
      content: 'Captcha verification is not enabled here.',
      flags: MessageFlags.Ephemeral
    });
  }

  await db.deleteExpiredVerificationCaptchas?.().catch(() => null);

  const code = randomCaptchaCode();
  const salt = crypto.randomBytes(16).toString('hex');
  const answerHash = hashAnswer(code, salt);

  const expiresAt = new Date(
    Date.now() + Number(config.captchaExpiresMinutes || 10) * 60 * 1000
  ).toISOString();

  await db.createVerificationCaptcha({
    guild_id: guild.id,
    user_id: user.id,
    channel_id: interaction.channelId,
    message_id: interaction.message?.id || null,
    answer_hash: answerHash,
    salt,
    attempts: 0,
    max_attempts: config.captchaMaxAttempts,
    expires_at: expiresAt
  });

  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [
      new EmbedBuilder()
        .setTitle('Your Captcha')
        .setDescription([
          'Type this code exactly when you press **Verify**:',
          '',
          `\`\`\`txt\n${code}\n\`\`\``,
          `Expires in **${config.captchaExpiresMinutes} minute(s)**.`
        ].join('\n'))
        .setColor(0x5865F2)
    ]
  });
}

async function showCaptchaModal(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('verification:modal')
    .setTitle('Solve Captcha');

  const input = new TextInputBuilder()
    .setCustomId('captcha_answer')
    .setLabel('Enter the captcha code')
    .setPlaceholder('Example: A7K9Q2')
    .setRequired(true)
    .setStyle(TextInputStyle.Short)
    .setMaxLength(20);

  modal.addComponents(
    new ActionRowBuilder().addComponents(input)
  );

  return interaction.showModal(modal);
}

async function handleCaptchaSubmit(interaction) {
  const guild = interaction.guild;
  const user = interaction.user;

  const captcha = await db.getVerificationCaptcha(guild.id, user.id).catch(() => null);

  if (!captcha) {
    return interaction.reply({
      content: 'You do not have an active captcha. Click **Captcha** first.',
      flags: MessageFlags.Ephemeral
    });
  }

  if (new Date(captcha.expires_at).getTime() <= Date.now()) {
    await db.deleteVerificationCaptcha(guild.id, user.id).catch(() => null);

    return interaction.reply({
      content: 'Your captcha expired. Click **Captcha** to get a new one.',
      flags: MessageFlags.Ephemeral
    });
  }

  const answer = interaction.fields.getTextInputValue('captcha_answer');
  const answerHash = hashAnswer(answer, captcha.salt);

  if (answerHash !== captcha.answer_hash) {
    const updated = await db.incrementVerificationCaptchaAttempts(guild.id, user.id).catch(() => null);
    const attempts = Number(updated?.attempts || captcha.attempts || 0);
    const maxAttempts = Number(captcha.max_attempts || 3);

    if (attempts >= maxAttempts) {
      await db.deleteVerificationCaptcha(guild.id, user.id).catch(() => null);

      return interaction.reply({
        content: 'Captcha failed too many times. Click **Captcha** to generate a new one.',
        flags: MessageFlags.Ephemeral
      });
    }

    return interaction.reply({
      content: `Incorrect captcha. Attempts: **${attempts}/${maxAttempts}**.`,
      flags: MessageFlags.Ephemeral
    });
  }

  const member = await guild.members.fetch(user.id).catch(() => null);

  if (!member) {
    return interaction.reply({
      content: 'I could not find your member profile in this server.',
      flags: MessageFlags.Ephemeral
    });
  }

  const result = await verifyMember(member, 'Rumi captcha verification completed');

  return interaction.reply({
    content: result.ok
      ? 'You are now verified. Welcome!'
      : `Verification failed: ${result.reason}`,
    flags: MessageFlags.Ephemeral
  });
}

async function safeInteractionError(interaction, error) {
  logger.warn(
    {
      error,
      guildId: interaction.guildId,
      userId: interaction.user?.id,
      customId: interaction.customId
    },
    'Verification interaction failed'
  );

  const payload = {
    content: `Verification failed: ${error.message || 'Unknown error.'}`,
    flags: MessageFlags.Ephemeral
  };

  if (interaction.replied || interaction.deferred) {
    return interaction.followUp(payload).catch(() => null);
  }

  return interaction.reply(payload).catch(() => null);
}

async function handleVerificationInteraction(interaction) {
  if (!interaction.guild) return false;

  try {
    if (interaction.isButton?.()) {
      if (interaction.customId === 'verification:captcha') {
        await createCaptchaChallenge(interaction);
        return true;
      }

      if (interaction.customId === 'verification:verify') {
        await showCaptchaModal(interaction);
        return true;
      }
    }

    if (interaction.isModalSubmit?.() && interaction.customId === 'verification:modal') {
      await handleCaptchaSubmit(interaction);
      return true;
    }

    return false;
  } catch (error) {
    await safeInteractionError(interaction, error);
    return true;
  }
}

async function handleVerificationReaction(reaction, user) {
  if (user?.bot) return false;

  if (reaction.partial) {
    await reaction.fetch().catch(() => null);
  }

  const message = reaction.message;
  const guild = message.guild;

  if (!guild) return false;

  const config = await getVerificationConfig(guild.id);

  if (!config.enabled || config.mode !== 'reaction') return false;
  if (message.id !== config.verifyMessageId) return false;

  const emojiId = reaction.emoji?.id;
  if (!emojiId || emojiId !== config.reactionEmojiId) return false;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return false;

  await verifyMember(member, 'Rumi reaction verification completed');

  return true;
}

module.exports = {
  DEFAULT_VERIFICATION,
  normalizeVerificationConfig,

  getVerificationConfig,
  saveVerificationConfig,

  setupVerification,
  sendVerificationPanel,

  applyVerificationOverwrite,
  applyVerificationOverwrites,
  applyVerificationToNewChannel,

  assignUnverifiedRole,
  verifyMember,

  handleVerificationInteraction,
  handleVerificationReaction,

  resolveServerEmoji
};