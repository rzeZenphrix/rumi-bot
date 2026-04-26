const {
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  ModalBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');

const emojis = require('../../config/botEmojis');
const { parseComponentEmoji } = require('../../utils/componentEmoji');
const ticketDb = require('./ticketDb');

function trim(value, length) {
  return String(value || '').slice(0, length);
}

function idFromMention(value) {
  return String(value || '').match(/\d{17,20}/)?.[0] || null;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'ticket';
}

function parseDurationToSeconds(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return null;

  if (/^\d+$/.test(raw)) return Number(raw);

  const match = raw.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/i);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();

  if (unit.startsWith('s')) return amount;
  if (unit.startsWith('m')) return amount * 60;
  if (unit.startsWith('h')) return amount * 60 * 60;
  if (unit.startsWith('d')) return amount * 60 * 60 * 24;

  return null;
}

function hasAnyRole(member, roleIds = []) {
  if (!roleIds?.length) return false;
  return member.roles.cache.some((role) => roleIds.includes(role.id));
}

function canUseStaffAction(member, type, bucket) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (!type) return false;

  const staff = type.staff_role_ids || [];
  const specific = type[bucket] || [];

  return hasAnyRole(member, [...staff, ...specific]);
}

function resolveTemplate(template, context) {
  const ticket = context.ticket || {};
  const type = context.type || {};
  const user = context.user;
  const guild = context.guild;
  const channel = context.channel;
  const claimedBy = ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed';

  return String(template || '')
    .replaceAll('{user}', user?.username || '')
    .replaceAll('{username}', user?.username || '')
    .replaceAll('{user_id}', user?.id || ticket.opener_id || '')
    .replaceAll('{user_mention}', user ? `<@${user.id}>` : ticket.opener_id ? `<@${ticket.opener_id}>` : '')
    .replaceAll('{server_name}', guild?.name || '')
    .replaceAll('{guild.name}', guild?.name || '')
    .replaceAll('{ticket_type}', type.name || ticket.ticket_type_name || '')
    .replaceAll('{ticket_key}', type.key || ticket.ticket_type_key || '')
    .replaceAll('{ticket_id}', ticket.id || '')
    .replaceAll('{ticket_number}', ticket.ticket_number ? String(ticket.ticket_number).padStart(4, '0') : '')
    .replaceAll('{channel}', channel?.name || '')
    .replaceAll('{channel_mention}', channel ? `<#${channel.id}>` : ticket.channel_id ? `<#${ticket.channel_id}>` : '')
    .replaceAll('{claimed_by}', claimedBy)
    .replaceAll('{created_at}', ticket.created_at ? `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:F>` : '')
    .replaceAll('{closed_at}', ticket.closed_at ? `<t:${Math.floor(new Date(ticket.closed_at).getTime() / 1000)}:F>` : '')
    .replaceAll('{close_reason}', ticket.close_reason || '');
}

function ticketChannelName(type, user, ticketNumber = 'new') {
  const format = type.channel_name_format || 'ticket-{ticket_number}';

  const raw = format
    .replaceAll('{username}', user.username)
    .replaceAll('{user}', user.username)
    .replaceAll('{user_id}', user.id)
    .replaceAll('{ticket_type}', type.key)
    .replaceAll('{ticket_number}', String(ticketNumber).padStart(4, '0'));

  return slug(raw).slice(0, 90);
}

function defaultPanelScript(guild, types) {
  const lines = types.map((type) => {
    const emoji = type.emoji || emojis.chat;
    return `${emoji} **${type.name}** — ${type.description || 'Open a ticket.'}`;
  });

  return `{embed}
$v{color: #8b5e3c}
$v{description: ${emojis.chat} Need help? Choose a ticket type below.

${lines.join('\n') || 'No ticket types configured yet.'}}
$v{thumbnail: ${guild.iconURL({ size: 256, extension: 'png' }) || ''}}`;
}

function safeEmojiObject(raw) {
  if (!raw) return null;
  const value = String(raw).trim();

  const custom = value.match(/^<a?:([a-zA-Z0-9_]+):(\d{17,20})>$/);
  if (custom) {
    return {
      name: custom[1],
      id: custom[2],
      animated: value.startsWith('<a:')
    };
  }

  // Only use single unicode emoji. Do not pass words like "link" as emoji.
  if (/^\p{Emoji_Presentation}$/u.test(value) || /^\p{Emoji}\uFE0F$/u.test(value)) {
    return { name: value };
  }

  return null;
}

function buildTicketTypeButton(type) {
  const button = new ButtonBuilder()
    .setCustomId(`ticket:create_key:${type.key}`)
    .setLabel(trim(type.name, 80))
    .setStyle(ButtonStyle.Primary);

  const emoji = safeEmojiObject(type.emoji);
  if (emoji) {
    const parsedEmoji = parseComponentEmoji(emoji);
    if (parsedEmoji) button.setEmoji(parsedEmoji);
  }

  return button;
}

function buildPanelComponents(types, mode = 'dropdown') {
  const enabledTypes = types.filter((type) => type.enabled);

  if (mode === 'buttons') {
    const rows = [];
    let row = new ActionRowBuilder();

    enabledTypes.slice(0, 25).forEach((type, index) => {
      if (index > 0 && index % 5 === 0) {
        rows.push(row);
        row = new ActionRowBuilder();
      }

      row.addComponents(buildTicketTypeButton(type));
    });

    if (row.components.length) rows.push(row);

    return rows.slice(0, 5);
  }

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket:select_key')
    .setPlaceholder('Choose a ticket type')
    .setMinValues(1)
    .setMaxValues(1);

  for (const type of enabledTypes.slice(0, 25)) {
    const option = {
      label: trim(type.name, 100),
      value: type.key,
      description: trim(type.description || `Open a ${type.name} ticket`, 100)
    };

    const emoji = safeEmojiObject(type.emoji);
    if (emoji) option.emoji = emoji;

    menu.addOptions(option);
  }

  return [new ActionRowBuilder().addComponents(menu)];
}

async function validatePanel(guild) {
  const warnings = [];
  const errors = [];
  const panel = await ticketDb.getPanel(guild.id);

  if (!panel) {
    errors.push('No ticket panel exists. Run `ticket panel create` first.');
    return { panel: null, types: [], errors, warnings };
  }

  const types = await ticketDb.listTicketTypes(guild.id);

  if (!types.length) {
    warnings.push('This panel has no ticket types yet.');
  }

  if (types.length > 7) {
    errors.push('Free servers can have a maximum of 7 ticket types.');
  }

  for (const type of types) {
    if (!type.enabled) {
      warnings.push(`Ticket type "${type.name}" is disabled.`);
    }

    if (!type.staff_role_ids?.length) {
      warnings.push(`Ticket type "${type.name}" has no staff roles configured.`);
    }

    const categoryId = type.category_id;

    if (!categoryId) {
      warnings.push(`Ticket type "${type.name}" has no category configured.`);
    } else {
      const category = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);

      if (!category) {
        errors.push(`Ticket type "${type.name}" references a deleted category.`);
      } else if (category.type !== ChannelType.GuildCategory) {
        errors.push(`Ticket type "${type.name}" category setting is not a category channel.`);
      }
    }

    for (const roleId of [
      ...(type.staff_role_ids || []),
      ...(type.view_role_ids || []),
      ...(type.claim_role_ids || []),
      ...(type.close_role_ids || []),
      ...(type.delete_role_ids || []),
      ...(type.reopen_role_ids || []),
      ...(type.participant_manage_role_ids || []),
      ...(type.transcript_role_ids || [])
    ]) {
      const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
      if (!role) errors.push(`Ticket type "${type.name}" references missing role ${roleId}.`);
    }
  }

  const me = guild.members.me;

  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    errors.push('I am missing Manage Channels.');
  }

  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    warnings.push('I am missing Manage Roles. Some permission updates may fail.');
  }

  return { panel, types, errors, warnings };
}

function panelValidationEmbed(result) {
  const embed = new EmbedBuilder().setColor(result.errors.length ? 0xed4245 : result.warnings.length ? 0xfee75c : 0x57f287);

  const description = [
    result.errors.length
      ? `${emojis.bad} **${result.errors.length} error(s)** found.`
      : `${emojis.good} No blocking errors found.`,
    result.warnings.length
      ? `${emojis.alert} **${result.warnings.length} warning(s)** found.`
      : ''
  ].filter(Boolean).join('\n');

  embed.setDescription(description);

  if (result.errors.length) {
    embed.addFields({
      name: 'Errors',
      value: result.errors.slice(0, 10).map((item) => `• ${item}`).join('\n').slice(0, 1024)
    });
  }

  if (result.warnings.length) {
    embed.addFields({
      name: 'Warnings',
      value: result.warnings.slice(0, 10).map((item) => `• ${item}`).join('\n').slice(0, 1024)
    });
  }

  return embed;
}

async function publishPanel({ guild, channel, mode = null, userId }) {
  const result = await validatePanel(guild);

  if (!result.panel) {
    const error = new Error('NO_PANEL');
    error.validation = result;
    throw error;
  }

  if (result.errors.length) {
    const error = new Error('PANEL_VALIDATION_FAILED');
    error.validation = result;
    throw error;
  }

  const panel = result.panel;
  const types = result.types;
  const chosenMode = mode || panel.mode || 'dropdown';

  const embed = new EmbedBuilder()
    .setColor(0x8b5e3c)
    .setDescription(`${emojis.chat} Need help? Choose a ticket type below.`);

  if (types.length) {
    embed.addFields({
      name: 'Available ticket types',
      value: types
        .filter((type) => type.enabled)
        .map((type) => `${type.emoji || emojis.chat} **${type.name}** — ${type.description || 'Open a ticket.'}`)
        .join('\n')
        .slice(0, 1024)
    });
  }

  const icon = guild.iconURL({ size: 256, extension: 'png' });
  if (icon) embed.setThumbnail(icon);

  const sent = await channel.send({
    embeds: [embed],
    components: buildPanelComponents(types, chosenMode),
    allowedMentions: { parse: [] }
  });

  await ticketDb.updatePanel(guild.id, {
    status: 'published',
    panel_channel_id: channel.id,
    panel_message_id: sent.id,
    mode: chosenMode,
    updated_by: userId
  });

  return sent;
}

function ticketControls(ticket, type, locked = false) {
  const claim = new ButtonBuilder()
    .setCustomId(`ticket:claim:${ticket.id}`)
    .setLabel('Claim')
    .setStyle(ButtonStyle.Primary)
    .setDisabled(locked || Boolean(ticket.claimed_by));

  const close = new ButtonBuilder()
    .setCustomId(`ticket:close:${ticket.id}`)
    .setLabel('Close')
    .setStyle(ButtonStyle.Danger)
    .setDisabled(locked);

  const transcript = new ButtonBuilder()
    .setCustomId(`ticket:transcript:${ticket.id}`)
    .setLabel('Transcript')
    .setStyle(ButtonStyle.Secondary);

  const claimEmoji = safeEmojiObject(emojis.add);
  const closeEmoji = safeEmojiObject(emojis.lock);
  const transcriptEmoji = safeEmojiObject(emojis.documents);

  if (claimEmoji) claim.setEmoji(claimEmoji);
  if (closeEmoji) close.setEmoji(closeEmoji);
  if (transcriptEmoji) transcript.setEmoji(transcriptEmoji);

  return [new ActionRowBuilder().addComponents(claim, close, transcript)];
}

async function failEphemeral(interaction, message, adminDetails = null) {
  const content = adminDetails ? `${message}\n\n${adminDetails}` : message;

  if (interaction.deferred || interaction.replied) {
    return interaction.followUp({ content, ephemeral: true }).catch(() => null);
  }

  return interaction.reply({ content, ephemeral: true }).catch(() => null);
}

async function ensureTicketCanOpen({ guild, member, type }) {
  if (!type) return { ok: false, reason: 'That ticket type no longer exists.' };
  if (!type.enabled) return { ok: false, reason: 'That ticket type is currently disabled.' };

  if (type.blocked_user_ids?.includes(member.id)) {
    return { ok: false, reason: 'You are blocked from opening this ticket type.' };
  }

  if (type.blocked_role_ids?.length && hasAnyRole(member, type.blocked_role_ids)) {
    return { ok: false, reason: 'One of your roles is blocked from opening this ticket type.' };
  }

  if (type.required_role_ids?.length && !hasAnyRole(member, type.required_role_ids)) {
    return { ok: false, reason: 'You do not have the required role for this ticket type.' };
  }

  const cooldown = await ticketDb.getCooldown(guild.id, member.id, type.key);
  if (cooldown) {
    return {
      ok: false,
      reason: `You are on cooldown for this ticket type until <t:${Math.floor(new Date(cooldown.expires_at).getTime() / 1000)}:R>.`
    };
  }

  const openOfType = await ticketDb.countOpenTicketsForUser(guild.id, member.id, type.key);

  if (type.prevent_duplicate_type && openOfType > 0) {
    return {
      ok: false,
      reason: `You already have an open ${type.name} ticket. Please close your existing ticket first.`
    };
  }

  if (openOfType >= Number(type.max_open_per_user || 1)) {
    return {
      ok: false,
      reason: `You have reached the open-ticket limit for ${type.name}.`
    };
  }

  if (type.category_id) {
    const category = await guild.channels.fetch(type.category_id).catch(() => null);

    if (!category) {
      return {
        ok: false,
        reason: 'I couldn’t create your ticket because the configured ticket category no longer exists.',
        admin: `Ticket type: ${type.name}\nMissing category: ${type.category_id}`
      };
    }
  }

  const me = guild.members.me;

  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
    return {
      ok: false,
      reason: 'I couldn’t create your ticket because I am missing Manage Channels.',
      admin: `Ticket type: ${type.name}\nMissing permission: Manage Channels`
    };
  }

  return { ok: true };
}

function buildOverwrites(guild, member, type) {
  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages
      ]
    }
  ];

  const roleIds = new Set([
    ...(type.staff_role_ids || []),
    ...(type.view_role_ids || [])
  ]);

  for (const roleId of roleIds) {
    overwrites.push({
      id: roleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  for (const userId of type.additional_user_ids || []) {
    overwrites.push({
      id: userId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  return overwrites;
}

async function openTicket({ guild, member, typeKey, panelId = null, formAnswers = [] }) {
  const type = await ticketDb.getTicketType(guild.id, typeKey);
  const validation = await ensureTicketCanOpen({ guild, member, type });

  if (!validation.ok) {
    return { ok: false, reason: validation.reason, admin: validation.admin, type };
  }

  const panel = await ticketDb.getPanel(guild.id);

  const formSummary = formAnswers.length
    ? formAnswers.map((item) => `**${item.label}**\n${item.answer || 'No answer'}`).join('\n\n')
    : null;

  const preliminary = await ticketDb.createTicketRecord({
    guildId: guild.id,
    panelId: panelId || panel?.id || null,
    type,
    openerId: member.id,
    formSummary
  });

  const channelName = ticketChannelName(type, member.user, preliminary.ticket_number);

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: type.category_id || undefined,
    topic: `Ticket ${preliminary.id} | ${type.name} | Opened by ${member.user.tag || member.user.username} (${member.id})`,
    permissionOverwrites: buildOverwrites(guild, member, type),
    reason: `Ticket opened by ${member.user.tag || member.user.username}`
  });

  const ticket = await ticketDb.updateTicket(preliminary.id, {
    channel_id: channel.id,
    status: 'open',
    last_activity_at: new Date()
  });

  await ticketDb.addParticipant(ticket.id, guild.id, member.id, member.id);

  for (const userId of type.additional_user_ids || []) {
    await ticketDb.addParticipant(ticket.id, guild.id, userId, member.id).catch(() => null);
  }

  if (formAnswers.length) {
    await ticketDb.saveFormAnswers({
      ticketId: ticket.id,
      guildId: guild.id,
      answers: formAnswers
    });
  }

  await ticketDb.setCooldown(guild.id, member.id, type.key, Number(type.cooldown_seconds || 0));

  const welcome = resolveTemplate(type.welcome_message, {
    guild,
    user: member.user,
    channel,
    ticket,
    type
  });

  const embed = new EmbedBuilder()
    .setColor(0x8b5e3c)
    .setDescription(welcome);

  if (formSummary) {
    embed.addFields({
      name: 'Submitted information',
      value: formSummary.slice(0, 1024)
    });
  }

  const staffMentions = type.ping_staff_on_open
    ? (type.staff_role_ids || []).map((roleId) => `<@&${roleId}>`).join(' ')
    : '';

  await channel.send({
    content: staffMentions || undefined,
    embeds: [embed],
    components: ticketControls(ticket, type),
    allowedMentions: {
      users: [member.id],
      roles: type.ping_staff_on_open ? (type.staff_role_ids || []) : []
    }
  });

  await ticketDb.logTicket({
    ticketId: ticket.id,
    guildId: guild.id,
    eventType: 'ticket_opened',
    actorId: member.id,
    channelId: channel.id,
    details: `${member.user.tag || member.user.username} opened ${type.name}.`,
    metadata: { typeKey: type.key }
  });

  await sendTicketLog(guild, type, {
    eventType: 'Ticket opened',
    ticket,
    type,
    actorId: member.id,
    channel,
    details: 'A new ticket was created.'
  });

  return { ok: true, ticket, type, channel };
}

async function createTicketModal(interaction, typeKey) {
  const type = await ticketDb.getTicketType(interaction.guild.id, typeKey);
  if (!type) return failEphemeral(interaction, 'That ticket type no longer exists.');

  const questions = await ticketDb.listQuestions(interaction.guild.id, type.id);

  if (!questions.length) {
    const result = await openTicket({
      guild: interaction.guild,
      member: interaction.member,
      typeKey
    });

    if (!result.ok) return failEphemeral(interaction, result.reason, result.admin);

    return interaction.reply({
      content: `${emojis.good} Your ticket was created: <#${result.channel.id}>`,
      ephemeral: true
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(`ticket:modal:${type.key}`)
    .setTitle(trim(`${type.name} Ticket`, 45));

  for (const question of questions.slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(`q:${question.id}`)
      .setLabel(trim(question.label, 45))
      .setStyle(question.style === 'short' ? TextInputStyle.Short : TextInputStyle.Paragraph)
      .setRequired(Boolean(question.required));

    if (question.placeholder) {
      input.setPlaceholder(trim(question.placeholder, 100));
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  const [, , typeKey] = interaction.customId.split(':');
  const type = await ticketDb.getTicketType(interaction.guild.id, typeKey);

  if (!type) {
    return failEphemeral(interaction, 'That ticket type no longer exists.');
  }

  const questions = await ticketDb.listQuestions(interaction.guild.id, type.id);
  const answers = questions.map((question) => ({
    questionId: question.id,
    label: question.label,
    answer: interaction.fields.getTextInputValue(`q:${question.id}`) || ''
  }));

  await interaction.deferReply({ ephemeral: true });

  const result = await openTicket({
    guild: interaction.guild,
    member: interaction.member,
    typeKey,
    formAnswers: answers
  });

  if (!result.ok) {
    return interaction.editReply({
      content: `${emojis.bad} ${result.reason}${result.admin ? `\n\n${result.admin}` : ''}`
    });
  }

  return interaction.editReply({
    content: `${emojis.good} Your ticket was created: <#${result.channel.id}>`
  });
}

async function fetchTicketTypeForTicket(ticket) {
  if (!ticket) return null;
  return ticketDb.getTicketType(ticket.guild_id, ticket.ticket_type_key);
}

async function sendTicketLog(guild, type, data) {
  const logChannelId = type?.log_channel_id || type?.transcript_channel_id;
  if (!logChannelId) return null;

  const channel = await guild.channels.fetch(logChannelId).catch(() => null);
  if (!channel?.send) return null;

  const ticket = data.ticket;

  const embed = new EmbedBuilder()
    .setColor(0x8b5e3c)
    .setDescription(`${emojis.documents} **${data.eventType}**`)
    .addFields(
      { name: 'Ticket', value: ticket ? `#${ticket.ticket_number} \`${ticket.id}\`` : 'Unknown', inline: true },
      { name: 'Type', value: data.type?.name || ticket?.ticket_type_name || 'Unknown', inline: true },
      { name: 'Channel', value: data.channel ? `<#${data.channel.id}>` : ticket?.channel_id ? `<#${ticket.channel_id}>` : 'Unknown', inline: true },
      { name: 'Opened by', value: ticket?.opener_id ? `<@${ticket.opener_id}>` : 'Unknown', inline: true },
      { name: 'Claimed by', value: ticket?.claimed_by ? `<@${ticket.claimed_by}>` : 'Unclaimed', inline: true },
      { name: 'Action by', value: data.actorId ? `<@${data.actorId}>` : 'System', inline: true },
      { name: 'Details', value: trim(data.details || 'No extra details.', 1024) }
    );

  if (ticket?.created_at) {
    embed.addFields({
      name: 'Created',
      value: `<t:${Math.floor(new Date(ticket.created_at).getTime() / 1000)}:F>`,
      inline: true
    });
  }

  if (ticket?.closed_at) {
    embed.addFields({
      name: 'Closed',
      value: `<t:${Math.floor(new Date(ticket.closed_at).getTime() / 1000)}:F>`,
      inline: true
    });
  }

  return channel.send({
    embeds: [embed],
    files: data.files || [],
    allowedMentions: { parse: [] }
  }).catch(() => null);
}

async function claimTicket({ guild, member, ticketId }) {
  const ticket = await ticketDb.getTicket(ticketId);
  if (!ticket) return { ok: false, reason: 'Ticket not found.' };

  const type = await fetchTicketTypeForTicket(ticket);
  if (!canUseStaffAction(member, type, 'claim_role_ids')) {
    return { ok: false, reason: 'You do not have permission to claim this ticket.' };
  }

  if (ticket.claimed_by) {
    return { ok: false, reason: `This ticket is already claimed by <@${ticket.claimed_by}>.` };
  }

  const updated = await ticketDb.updateTicket(ticket.id, {
    status: 'claimed',
    claimed_by: member.id,
    claimed_at: new Date()
  });

  await ticketDb.logTicket({
    ticketId: ticket.id,
    guildId: guild.id,
    eventType: 'ticket_claimed',
    actorId: member.id,
    channelId: ticket.channel_id,
    details: `Ticket claimed by ${member.user.tag || member.user.username}.`
  });

  const channel = ticket.channel_id ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;

  if (channel?.send) {
    await channel.send({
      content: `${emojis.good} Ticket claimed by ${member}.`,
      allowedMentions: { users: [member.id], roles: [] }
    }).catch(() => null);
  }

  await sendTicketLog(guild, type, {
    eventType: 'Ticket claimed',
    ticket: updated,
    type,
    actorId: member.id,
    channel,
    details: 'A staff member claimed this ticket.'
  });

  return { ok: true, ticket: updated, channel, type };
}

async function unclaimTicket({ guild, member, ticketId }) {
  const ticket = await ticketDb.getTicket(ticketId);
  if (!ticket) return { ok: false, reason: 'Ticket not found.' };

  const type = await fetchTicketTypeForTicket(ticket);
  if (!canUseStaffAction(member, type, 'claim_role_ids')) {
    return { ok: false, reason: 'You do not have permission to unclaim this ticket.' };
  }

  const updated = await ticketDb.updateTicket(ticket.id, {
    status: 'open',
    claimed_by: null,
    claimed_at: null
  });

  await ticketDb.logTicket({
    ticketId: ticket.id,
    guildId: guild.id,
    eventType: 'ticket_unclaimed',
    actorId: member.id,
    channelId: ticket.channel_id,
    details: 'Ticket unclaimed.'
  });

  return { ok: true, ticket: updated, type };
}

async function fetchAllMessages(channel) {
  const messages = [];
  let before;

  while (true) {
    const batch = await channel.messages.fetch({
      limit: 100,
      before
    }).catch(() => null);

    if (!batch?.size) break;

    messages.push(...batch.values());
    before = batch.last().id;

    if (messages.length >= 2000) break;
  }

  return messages.reverse();
}

function renderTranscript(ticket, messages, closeReason = null) {
  const lines = [
    `Ticket Type: ${ticket.ticket_type_name}`,
    `Ticket ID: ${ticket.id}`,
    `Ticket Number: ${ticket.ticket_number}`,
    `Opened By: ${ticket.opener_id}`,
    `Claimed By: ${ticket.claimed_by || 'Unclaimed'}`,
    `Closed By: ${ticket.closed_by || 'Not closed'}`,
    `Close Reason: ${closeReason || ticket.close_reason || 'None'}`,
    `Created At: ${ticket.created_at}`,
    `Closed At: ${ticket.closed_at || 'Not closed'}`,
    '',
    '--- Messages ---',
    ''
  ];

  let attachmentCount = 0;

  for (const message of messages) {
    const author = message.author?.tag || message.author?.username || message.author?.id || 'Unknown';
    const stamp = message.createdAt?.toISOString?.() || '';
    lines.push(`[${stamp}] ${author}: ${message.content || ''}`);

    if (message.embeds?.length) {
      for (const embed of message.embeds) {
        lines.push(`  [embed] ${embed.title || ''} ${embed.description || ''}`.trim());
      }
    }

    if (message.attachments?.size) {
      for (const attachment of message.attachments.values()) {
        attachmentCount += 1;
        lines.push(`  [attachment] ${attachment.name || 'file'} ${attachment.url}`);
      }
    }
  }

  return {
    content: lines.join('\n'),
    messageCount: messages.length,
    attachmentCount
  };
}

async function generateTranscript({ guild, channel, ticket, actorId, closeReason = null }) {
  const messages = await fetchAllMessages(channel);
  const rendered = renderTranscript(ticket, messages, closeReason);

  const saved = await ticketDb.saveTranscript({
    ticketId: ticket.id,
    guildId: guild.id,
    format: 'txt',
    content: rendered.content,
    generatedBy: actorId,
    messageCount: rendered.messageCount,
    attachmentCount: rendered.attachmentCount
  });

  const file = new AttachmentBuilder(Buffer.from(rendered.content, 'utf8'), {
    name: `ticket-${ticket.ticket_number}-transcript.txt`
  });

  return { saved, file, ...rendered };
}

async function closeTicket({ guild, member, ticketId, reason = 'No reason provided.' }) {
  const ticket = await ticketDb.getTicket(ticketId);
  if (!ticket) return { ok: false, reason: 'Ticket not found.' };

  const type = await fetchTicketTypeForTicket(ticket);
  const isOpener = ticket.opener_id === member.id;

  if (!isOpener || !type?.opener_can_close) {
    if (!canUseStaffAction(member, type, 'close_role_ids')) {
      return { ok: false, reason: 'You do not have permission to close this ticket.' };
    }
  }

  const channel = ticket.channel_id ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;

  const updated = await ticketDb.updateTicket(ticket.id, {
    status: 'closed',
    closed_by: member.id,
    closed_at: new Date(),
    close_reason: reason
  });

  let transcript = null;

  if (channel?.messages && type?.save_transcript_on_close) {
    transcript = await generateTranscript({
      guild,
      channel,
      ticket: updated,
      actorId: member.id,
      closeReason: reason
    }).catch(() => null);
  }

  await ticketDb.logTicket({
    ticketId: ticket.id,
    guildId: guild.id,
    eventType: 'ticket_closed',
    actorId: member.id,
    channelId: ticket.channel_id,
    details: reason
  });

  if (channel?.send) {
    await channel.send({
      content: `${emojis.lock} Ticket closed by ${member}. Reason: ${reason}`,
      files: transcript?.file ? [transcript.file] : [],
      allowedMentions: { users: [member.id], roles: [] }
    }).catch(() => null);

    await channel.permissionOverwrites.edit(ticket.opener_id, {
      SendMessages: false
    }).catch(() => null);
  }

  await sendTicketLog(guild, type, {
    eventType: 'Ticket closed',
    ticket: updated,
    type,
    actorId: member.id,
    channel,
    details: `Reason: ${reason}`,
    files: transcript?.file ? [transcript.file] : []
  });

  return { ok: true, ticket: updated, channel, type, transcript };
}

async function reopenTicket({ guild, member, ticketId }) {
  const ticket = await ticketDb.getTicket(ticketId);
  if (!ticket) return { ok: false, reason: 'Ticket not found.' };

  const type = await fetchTicketTypeForTicket(ticket);

  if (!type?.allow_reopen) {
    return { ok: false, reason: 'This ticket type does not allow reopening.' };
  }

  if (!canUseStaffAction(member, type, 'reopen_role_ids') && ticket.opener_id !== member.id) {
    return { ok: false, reason: 'You do not have permission to reopen this ticket.' };
  }

  const updated = await ticketDb.updateTicket(ticket.id, {
    status: 'open',
    reopened_by: member.id,
    reopened_at: new Date(),
    closed_by: null,
    closed_at: null,
    close_reason: null
  });

  const channel = ticket.channel_id ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;

  if (channel?.send) {
    await channel.permissionOverwrites.edit(ticket.opener_id, {
      SendMessages: true,
      ViewChannel: true
    }).catch(() => null);

    await channel.send({
      content: `${emojis.unlock} Ticket reopened by ${member}.`,
      components: ticketControls(updated, type),
      allowedMentions: { users: [member.id], roles: [] }
    }).catch(() => null);
  }

  await sendTicketLog(guild, type, {
    eventType: 'Ticket reopened',
    ticket: updated,
    type,
    actorId: member.id,
    channel,
    details: 'Ticket was reopened.'
  });

  return { ok: true, ticket: updated, channel, type };
}

async function addUserToTicket({ guild, member, targetUserId, ticketId }) {
  const ticket = ticketId ? await ticketDb.getTicket(ticketId) : await ticketDb.getTicketByChannel(guild.id, member.voice?.channelId || '');
  const activeTicket = ticket || await ticketDb.getTicketByChannel(guild.id, member.client?.channel?.id || '');
  const resolvedTicket = activeTicket || ticket;

  if (!resolvedTicket) return { ok: false, reason: 'Ticket not found.' };

  const type = await fetchTicketTypeForTicket(resolvedTicket);
  if (!canUseStaffAction(member, type, 'participant_manage_role_ids')) {
    return { ok: false, reason: 'You do not have permission to manage ticket participants.' };
  }

  const channel = resolvedTicket.channel_id ? await guild.channels.fetch(resolvedTicket.channel_id).catch(() => null) : null;

  if (channel) {
    await channel.permissionOverwrites.edit(targetUserId, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true
    });
  }

  await ticketDb.addParticipant(resolvedTicket.id, guild.id, targetUserId, member.id);

  return { ok: true, ticket: resolvedTicket, channel, type };
}

async function removeUserFromTicket({ guild, member, targetUserId, ticketId }) {
  const ticket = await ticketDb.getTicket(ticketId);
  if (!ticket) return { ok: false, reason: 'Ticket not found.' };

  const type = await fetchTicketTypeForTicket(ticket);
  if (!canUseStaffAction(member, type, 'participant_manage_role_ids')) {
    return { ok: false, reason: 'You do not have permission to manage ticket participants.' };
  }

  const channel = ticket.channel_id ? await guild.channels.fetch(ticket.channel_id).catch(() => null) : null;

  if (channel) {
    await channel.permissionOverwrites.delete(targetUserId).catch(() => null);
  }

  await ticketDb.removeParticipant(ticket.id, guild.id, targetUserId, member.id);

  return { ok: true, ticket, channel, type };
}

async function handleTicketInteraction(interaction) {
  if (!interaction.guild || !interaction.customId?.startsWith('ticket:')) return false;

  const parts = interaction.customId.split(':');
  const action = parts[1];

  if (action === 'create_key') {
    return createTicketModal(interaction, parts.slice(2).join(':'));
  }

  if (action === 'select_key') {
    const typeKey = interaction.values?.[0];
    return createTicketModal(interaction, typeKey);
  }

  if (action === 'modal') {
    return handleModalSubmit(interaction);
  }

  if (action === 'claim') {
    await interaction.deferReply({ ephemeral: true });
    const result = await claimTicket({
      guild: interaction.guild,
      member: interaction.member,
      ticketId: parts[2]
    });

    return interaction.editReply({
      content: result.ok ? `${emojis.good} Ticket claimed.` : `${emojis.bad} ${result.reason}`
    });
  }

  if (action === 'close') {
    await interaction.deferReply({ ephemeral: true });
    const result = await closeTicket({
      guild: interaction.guild,
      member: interaction.member,
      ticketId: parts[2],
      reason: 'Closed from ticket button.'
    });

    return interaction.editReply({
      content: result.ok ? `${emojis.lock} Ticket closed.` : `${emojis.bad} ${result.reason}`
    });
  }

  if (action === 'transcript') {
    await interaction.deferReply({ ephemeral: true });

    const ticket = await ticketDb.getTicket(parts[2]);
    if (!ticket) return interaction.editReply(`${emojis.bad} Ticket not found.`);

    const type = await fetchTicketTypeForTicket(ticket);
    if (!canUseStaffAction(interaction.member, type, 'transcript_role_ids') && ticket.opener_id !== interaction.user.id) {
      return interaction.editReply(`${emojis.bad} You do not have permission to generate this transcript.`);
    }

    const channel = ticket.channel_id ? await interaction.guild.channels.fetch(ticket.channel_id).catch(() => null) : interaction.channel;
    if (!channel) return interaction.editReply(`${emojis.bad} Ticket channel not found.`);

    const transcript = await generateTranscript({
      guild: interaction.guild,
      channel,
      ticket,
      actorId: interaction.user.id
    });

    return interaction.followUp({
      content: `${emojis.documents} Transcript generated.`,
      files: [transcript.file],
      ephemeral: true
    });
  }

  return false;
}

module.exports = {
  idFromMention,
  parseDurationToSeconds,
  safeEmojiObject,
  buildPanelComponents,
  buildTicketTypeButton,
  defaultPanelScript,
  validatePanel,
  panelValidationEmbed,
  publishPanel,
  ticketControls,
  openTicket,
  claimTicket,
  unclaimTicket,
  closeTicket,
  reopenTicket,
  addUserToTicket,
  removeUserFromTicket,
  generateTranscript,
  handleTicketInteraction,
  canUseStaffAction,
  resolveTemplate
};
