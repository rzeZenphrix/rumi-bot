const {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const db = require('../database/db');

const TICKET_EMOJI = '<:chat:1497571865051398346>';
const GOOD_EMOJI = '<:good:1497281757144154203>';
const BAD_EMOJI = '<:bad:1497281754510266548>';

function makeEmbed(type, text, fields = []) {
  const data = {
    good: {
      color: 0x57f287,
      emoji: GOOD_EMOJI
    },
    bad: {
      color: 0xed4245,
      emoji: BAD_EMOJI
    },
    ticket: {
      color: 0x2b1a1d,
      emoji: TICKET_EMOJI
    }
  }[type] || {
    color: 0x5865f2,
    emoji: TICKET_EMOJI
  };

  const embed = new EmbedBuilder()
    .setColor(data.color)
    .setDescription(`${data.emoji} ${text}`.slice(0, 4096));

  if (fields.length) embed.addFields(fields.slice(0, 25));

  return embed;
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 90);
}

function ticketNumber() {
  return Math.floor(Date.now() / 1000).toString(36).toUpperCase();
}

function msToText(ms) {
  if (!ms) return 'none';

  const seconds = Math.ceil(ms / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.ceil(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.ceil(seconds / 3600)}h`;

  return `${Math.ceil(seconds / 86400)}d`;
}

function renderTemplate(text, data) {
  return String(text || '')
    .replaceAll('{user}', data.username)
    .replaceAll('{username}', data.username)
    .replaceAll('{user_id}', data.userId)
    .replaceAll('{user_mention}', `<@${data.userId}>`)
    .replaceAll('{ticket_type}', data.ticketType)
    .replaceAll('{ticket_id}', data.ticketId)
    .replaceAll('{ticket_number}', data.ticketNumber)
    .replaceAll('{server_name}', data.serverName);
}

async function getTicketType(guildId, key) {
  return db.one(
    `
    select *
    from ticket_types
    where guild_id = $1 and key = $2
    limit 1
    `,
    [guildId, key]
  );
}

async function getTicketByChannel(guildId, channelId) {
  return db.one(
    `
    select *
    from tickets
    where guild_id = $1 and channel_id = $2
    limit 1
    `,
    [guildId, channelId]
  );
}

async function logTicket(guildId, ticketId, eventType, actorId, data = {}) {
  await db.exec(
    `
    insert into ticket_logs (guild_id, ticket_id, event_type, actor_id, data)
    values ($1, $2, $3, $4, $5::jsonb)
    `,
    [guildId, ticketId, eventType, actorId, JSON.stringify(data)]
  );
}

async function createTicketFromInteraction(interaction, typeKey) {
  if (!db.hasDatabaseConfigured?.()) {
    return interaction.editReply({
      embeds: [
        makeEmbed(
          'bad',
          'The database is not connected yet. Please contact the bot owner.'
        )
      ]
    });
  }

  const guild = interaction.guild;
  const member = interaction.member;
  const type = await getTicketType(guild.id, typeKey);

  if (!type) {
    return interaction.editReply({
      embeds: [makeEmbed('bad', `This ticket type no longer exists: \`${typeKey}\`.`)]
    });
  }

  if (!type.enabled) {
    return interaction.editReply({
      embeds: [makeEmbed('bad', `This ticket type is currently disabled: **${type.name}**.`)]
    });
  }

  if (!type.category_id) {
    return interaction.editReply({
      embeds: [
        makeEmbed(
          'bad',
          'This ticket type has no category configured. Please contact an administrator.'
        )
      ]
    });
  }

  const category = guild.channels.cache.get(type.category_id);

  if (!category) {
    return interaction.editReply({
      embeds: [
        makeEmbed(
          'bad',
          'I couldn’t create your ticket because the configured category no longer exists. Please contact an administrator.'
        )
      ]
    });
  }

  const openCount = await db.one(
    `
    select count(*)::int as count
    from tickets
    where guild_id = $1
      and opener_id = $2
      and type_key = $3
      and status in ('open', 'claimed')
    `,
    [guild.id, member.id, type.key]
  );

  if (openCount?.count >= type.max_open_per_user) {
    return interaction.editReply({
      embeds: [makeEmbed('bad', `You already have an open **${type.name}** ticket.`)]
    });
  }

  const cooldown = await db.one(
    `
    select last_opened_at
    from ticket_cooldowns
    where guild_id = $1 and user_id = $2 and type_key = $3
    `,
    [guild.id, member.id, type.key]
  );

  if (cooldown && Number(type.cooldown_ms) > 0) {
    const last = new Date(cooldown.last_opened_at).getTime();
    const remaining = last + Number(type.cooldown_ms) - Date.now();

    if (remaining > 0) {
      return interaction.editReply({
        embeds: [
          makeEmbed(
            'bad',
            `Please wait **${msToText(remaining)}** before opening another **${type.name}** ticket.`
          )
        ]
      });
    }
  }

  const ticketId = `TCK-${ticketNumber()}`;
  const number = ticketNumber();

  const rawName = renderTemplate(type.channel_name_format, {
    username: interaction.user.username,
    userId: interaction.user.id,
    ticketType: type.key,
    ticketId,
    ticketNumber: number,
    serverName: guild.name
  });

  const channelName = slug(rawName || `${type.key}-${interaction.user.username}`);

  const permissionOverwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: interaction.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }
  ];

  if (type.staff_role_id && guild.roles.cache.get(type.staff_role_id)) {
    permissionOverwrites.push({
      id: type.staff_role_id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites,
    topic: `Ticket ${ticketId} | Type: ${type.key} | Opened by ${interaction.user.tag} (${interaction.user.id})`
  });

  await db.exec(
    `
    insert into tickets (guild_id, ticket_id, ticket_number, type_key, channel_id, opener_id)
    values ($1, $2, $3, $4, $5, $6)
    `,
    [guild.id, ticketId, number, type.key, channel.id, interaction.user.id]
  );

  await db.exec(
    `
    insert into ticket_cooldowns (guild_id, user_id, type_key, last_opened_at)
    values ($1, $2, $3, now())
    on conflict (guild_id, user_id, type_key)
    do update set last_opened_at = now()
    `,
    [guild.id, interaction.user.id, type.key]
  );

  const welcome = renderTemplate(type.welcome_message, {
    username: interaction.user.username,
    userId: interaction.user.id,
    ticketType: type.name,
    ticketId,
    ticketNumber: number,
    serverName: guild.name
  });

  await channel.send({
    content: `<@${interaction.user.id}>`,
    embeds: [makeEmbed('ticket', welcome)],
    allowedMentions: {
      users: [interaction.user.id],
      roles: []
    }
  });

  await logTicket(guild.id, ticketId, 'ticket_opened', interaction.user.id, {
    channelId: channel.id,
    typeKey: type.key
  });

  return interaction.editReply({
    embeds: [makeEmbed('good', `Your ticket has been created: ${channel}`)]
  });
}

async function claimTicketFromInteraction(interaction) {
  const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);

  if (!ticket) {
    return interaction.editReply({
      embeds: [makeEmbed('bad', 'This channel is not a ticket.')]
    });
  }

  if (ticket.claimed_by) {
    return interaction.editReply({
      embeds: [makeEmbed('bad', `This ticket is already claimed by <@${ticket.claimed_by}>.`)]
    });
  }

  await db.exec(
    `
    update tickets
    set claimed_by = $3, claimed_at = now(), status = 'claimed'
    where guild_id = $1 and channel_id = $2
    `,
    [interaction.guild.id, interaction.channel.id, interaction.user.id]
  );

  await logTicket(interaction.guild.id, ticket.ticket_id, 'ticket_claimed', interaction.user.id);

  return interaction.editReply({
    embeds: [makeEmbed('good', `Ticket claimed by ${interaction.user}.`)]
  });
}

async function closeTicketFromInteraction(interaction) {
  const ticket = await getTicketByChannel(interaction.guild.id, interaction.channel.id);

  if (!ticket) {
    return interaction.editReply({
      embeds: [makeEmbed('bad', 'This channel is not a ticket.')]
    });
  }

  await db.exec(
    `
    update tickets
    set status = 'closed',
        closed_by = $3,
        close_reason = $4,
        closed_at = now()
    where guild_id = $1 and channel_id = $2
    `,
    [interaction.guild.id, interaction.channel.id, interaction.user.id, 'Closed from button.']
  );

  await interaction.channel.permissionOverwrites
    .edit(ticket.opener_id, {
      SendMessages: false,
      ViewChannel: true
    })
    .catch(() => null);

  await logTicket(interaction.guild.id, ticket.ticket_id, 'ticket_closed', interaction.user.id, {
    reason: 'Closed from button.'
  });

  return interaction.editReply({
    embeds: [makeEmbed('good', 'Ticket closed.')]
  });
}

module.exports = {
  createTicketFromInteraction,
  claimTicketFromInteraction,
  closeTicketFromInteraction
};