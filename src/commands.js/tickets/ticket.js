const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');

let db = null;

try {
  db = require('../../systems/database/db');
} catch {
  db = null;
}

const TICKET_EMOJI = '<:chat:1497571865051398346>';
const GOOD_EMOJI = '<:good:1497281757144154203>';
const BAD_EMOJI = '<:bad:1497281754510266548>';
const INFO_EMOJI = '<:info:1497281758188536050>';

function cleanId(value) {
  return String(value || '').replace(/[<#@&!>]/g, '').trim();
}

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function parseDurationMs(input) {
  const text = String(input || '').trim().toLowerCase();
  const match = text.match(/^(\d+)(s|m|h|d)?$/);

  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2] || 's';

  const map = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000
  };

  return amount * map[unit];
}

function msToText(ms) {
  if (!ms) return 'none';

  const seconds = Math.floor(ms / 1000);

  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;

  return `${Math.floor(seconds / 86400)}d`;
}

function ticketNumber() {
  return Math.floor(Date.now() / 1000).toString(36).toUpperCase();
}

function makeEmbed(type, description, fields = []) {
  const colors = {
    info: 0x5865f2,
    good: 0x57f287,
    bad: 0xed4245,
    list: 0x2b2d31
  };

  const emoji = {
    info: INFO_EMOJI,
    good: GOOD_EMOJI,
    bad: BAD_EMOJI,
    list: TICKET_EMOJI
  }[type] || INFO_EMOJI;

  const embed = new EmbedBuilder()
    .setColor(colors[type] || colors.info)
    .setDescription(`${emoji} ${description}`.slice(0, 4096));

  if (fields.length) {
    embed.addFields(fields.slice(0, 25));
  }

  return embed;
}

async function send(message, type, description, fields = []) {
  return message.channel.send({
    embeds: [makeEmbed(type, description, fields)],
    allowedMentions: { parse: [] }
  });
}

async function ensureTables() {
  if (!db) {
    throw new Error('Database module missing at src/systems/database/db.js');
  }

  if (!db.hasDatabaseConfigured?.()) {
    throw new Error('Database not configured. Add DATABASE_URL or SUPABASE_DB_URL to .env.');
  }

  await db.exec(`
    create table if not exists ticket_panels (
      id bigserial primary key,
      guild_id text not null unique,
      name text not null default 'Main Ticket Panel',
      created_by text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
  `);

  await db.exec(`alter table ticket_panels add column if not exists channel_id text;`);
  await db.exec(`alter table ticket_panels add column if not exists message_id text;`);
  await db.exec(`alter table ticket_panels add column if not exists embed_json jsonb not null default '{}'::jsonb;`);
  await db.exec(`alter table ticket_panels add column if not exists panel_description text not null default 'Need help? Select the correct ticket type below and staff will assist you.';`);
  await db.exec(`alter table ticket_panels add column if not exists panel_color text not null default '#2b1a1d';`);
  await db.exec(`alter table ticket_panels add column if not exists panel_image text;`);
  await db.exec(`alter table ticket_panels add column if not exists panel_thumbnail text;`);
  await db.exec(`alter table ticket_panels add column if not exists panel_mode text not null default 'buttons';`);

  await db.exec(`
    create table if not exists ticket_types (
      id bigserial primary key,
      guild_id text not null,
      key text not null,
      name text not null,
      description text not null default '',
      emoji text not null default '🎫',
      enabled boolean not null default true,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (guild_id, key)
    );
  `);

  await db.exec(`alter table ticket_types add column if not exists category_id text;`);
  await db.exec(`alter table ticket_types add column if not exists staff_role_id text;`);
  await db.exec(`alter table ticket_types add column if not exists log_channel_id text;`);
  await db.exec(`alter table ticket_types add column if not exists transcript_channel_id text;`);
  await db.exec(`alter table ticket_types add column if not exists max_open_per_user integer not null default 1;`);
  await db.exec(`alter table ticket_types add column if not exists cooldown_ms bigint not null default 300000;`);
  await db.exec(`alter table ticket_types add column if not exists channel_name_format text not null default '{type}-{username}';`);
  await db.exec(`alter table ticket_types add column if not exists welcome_message text not null default 'Welcome {user_mention}, thanks for opening a {ticket_type} ticket. A staff member will assist you soon. Ticket ID: {ticket_id}';`);

  await db.exec(`
    create table if not exists tickets (
      id bigserial primary key,
      guild_id text not null,
      ticket_id text not null,
      ticket_number text not null,
      type_key text not null,
      channel_id text not null,
      opener_id text not null,
      claimed_by text,
      status text not null default 'open',
      close_reason text,
      closed_by text,
      opened_at timestamptz not null default now(),
      claimed_at timestamptz,
      closed_at timestamptz,
      unique (guild_id, ticket_id),
      unique (guild_id, channel_id)
    );
  `);

  await db.exec(`
    create table if not exists ticket_cooldowns (
      guild_id text not null,
      user_id text not null,
      type_key text not null,
      last_opened_at timestamptz not null default now(),
      primary key (guild_id, user_id, type_key)
    );
  `);

  await db.exec(`
    create table if not exists ticket_logs (
      id bigserial primary key,
      guild_id text not null,
      ticket_id text,
      event_type text not null,
      actor_id text,
      data jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now()
    );
  `);
}

async function getPanel(guildId) {
  await ensureTables();

  return db.one(
    'select * from ticket_panels where guild_id = $1 limit 1',
    [guildId]
  );
}

async function createPanel(guildId, userId) {
  await ensureTables();

  const existing = await getPanel(guildId);

  if (existing) return existing;

  return db.one(
    `
    insert into ticket_panels (guild_id, created_by)
    values ($1, $2)
    returning *
    `,
    [guildId, userId]
  );
}

async function getTypes(guildId) {
  await ensureTables();

  return db.many(
    'select * from ticket_types where guild_id = $1 order by id asc',
    [guildId]
  );
}

async function getType(guildId, key) {
  await ensureTables();

  return db.one(
    'select * from ticket_types where guild_id = $1 and key = $2 limit 1',
    [guildId, key]
  );
}

async function logTicket(guildId, ticketId, eventType, actorId, data = {}) {
  await ensureTables();

  await db.exec(
    `
    insert into ticket_logs (guild_id, ticket_id, event_type, actor_id, data)
    values ($1, $2, $3, $4, $5::jsonb)
    `,
    [guildId, ticketId, eventType, actorId, JSON.stringify(data)]
  );
}

function isHexColor(value) {
  return /^#?[0-9a-f]{6}$/i.test(String(value || '').trim());
}

function normalizeHexColor(value, fallback = '#2b1a1d') {
  const clean = String(value || '').replace('#', '').trim();

  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;

  return `#${clean.toLowerCase()}`;
}

function hexToNumber(value, fallback = 0x2b1a1d) {
  const clean = String(value || '').replace('#', '').trim();

  if (!/^[0-9a-f]{6}$/i.test(clean)) return fallback;

  return Number.parseInt(clean, 16);
}

async function cmdPanel({ message, args }) {
  const action = (args.shift() || 'view').toLowerCase();

  if (action === 'create') {
    const panel = await createPanel(message.guild.id, message.author.id);

    return send(message, 'good', 'Ticket panel created for this server.', [
      {
        name: 'Panel ID',
        value: `\`${panel.id}\``,
        inline: true
      },
      {
        name: 'Next step',
        value: '`ticket type add support Support`',
        inline: true
      }
    ]);
  }

  if (action === 'view') {
    const panel = await getPanel(message.guild.id);
    const types = await getTypes(message.guild.id);

    if (!panel) {
      return send(message, 'bad', 'No ticket panel exists yet. Use `ticket panel create`.');
    }

    return send(message, 'list', 'Ticket panel settings.', [
      {
        name: 'Mode',
        value: panel.panel_mode || 'buttons',
        inline: true
      },
      {
        name: 'Color',
        value: panel.panel_color || '#2b1a1d',
        inline: true
      },
      {
        name: 'Published',
        value: panel.channel_id ? `<#${panel.channel_id}>` : 'not published',
        inline: true
      },
      {
        name: 'Description',
        value: String(panel.panel_description || 'No description.').slice(0, 1024)
      },
      {
        name: 'Ticket types',
        value: types.length ? types.map((type) => `\`${type.key}\``).join(', ') : 'none'
      }
    ]);
  }

  if (action === 'message' || action === 'description') {
    const description = args.join(' ').trim();

    if (!description) {
      return send(message, 'info', 'Usage: `ticket panel message <description>`.');
    }

    await createPanel(message.guild.id, message.author.id);

    await db.exec(
      `
      update ticket_panels
      set panel_description = $2, updated_at = now()
      where guild_id = $1
      `,
      [message.guild.id, description.slice(0, 3500)]
    );

    return send(message, 'good', 'Ticket panel description updated.');
  }

  if (action === 'color') {
    const color = args[0];

    if (!isHexColor(color)) {
      return send(message, 'bad', 'Use a valid hex color like `#8b5e3c`.');
    }

    await createPanel(message.guild.id, message.author.id);

    await db.exec(
      `
      update ticket_panels
      set panel_color = $2, updated_at = now()
      where guild_id = $1
      `,
      [message.guild.id, normalizeHexColor(color)]
    );

    return send(message, 'good', `Ticket panel color set to \`${normalizeHexColor(color)}\`.`);
  }

  if (action === 'image' || action === 'thumbnail') {
    const value = args.join(' ').trim();
    const column = action === 'image' ? 'panel_image' : 'panel_thumbnail';

    await createPanel(message.guild.id, message.author.id);

    if (!value || value.toLowerCase() === 'none' || value.toLowerCase() === 'remove') {
      await db.exec(
        `update ticket_panels set ${column} = null, updated_at = now() where guild_id = $1`,
        [message.guild.id]
      );

      return send(message, 'good', `Ticket panel ${action} removed.`);
    }

    if (!/^https?:\/\//i.test(value)) {
      return send(message, 'bad', `Please provide a valid image URL or use \`none\`.`);
    }

    await db.exec(
      `update ticket_panels set ${column} = $2, updated_at = now() where guild_id = $1`,
      [message.guild.id, value]
    );

    return send(message, 'good', `Ticket panel ${action} updated.`);
  }

  if (action === 'mode') {
    const mode = String(args[0] || '').toLowerCase();

    if (!['buttons', 'dropdown'].includes(mode)) {
      return send(message, 'info', 'Usage: `ticket panel mode <buttons|dropdown>`.');
    }

    await createPanel(message.guild.id, message.author.id);

    await db.exec(
      `
      update ticket_panels
      set panel_mode = $2, updated_at = now()
      where guild_id = $1
      `,
      [message.guild.id, mode]
    );

    return send(message, 'good', `Ticket panel mode set to **${mode}**.`);
  }

  if (action === 'preview') {
    const panel = await getPanel(message.guild.id);
    const types = await getTypes(message.guild.id);

    if (!panel) {
      return send(message, 'bad', 'No ticket panel exists yet. Use `ticket panel create`.');
    }

    const embed = new EmbedBuilder()
      .setColor(hexToNumber(panel.panel_color))
      .setDescription(`${TICKET_EMOJI} ${panel.panel_description}`);

    if (panel.panel_image) embed.setImage(panel.panel_image);
    if (panel.panel_thumbnail) embed.setThumbnail(panel.panel_thumbnail);

    return message.channel.send({
      embeds: [embed],
      allowedMentions: { parse: [] }
    });
  }

  if (action === 'validate') {
    const panel = await getPanel(message.guild.id);
    const types = await getTypes(message.guild.id);
    const warnings = [];

    if (!panel) warnings.push('No ticket panel exists.');
    if (!types.length) warnings.push('No ticket types have been configured.');
    if (types.length > 7) warnings.push('Free tier supports up to 7 ticket types.');

    for (const type of types) {
      if (!type.enabled) warnings.push(`Ticket type \`${type.key}\` is disabled.`);

      if (!type.category_id) {
        warnings.push(`Ticket type \`${type.key}\` has no category configured.`);
      } else if (!message.guild.channels.cache.get(type.category_id)) {
        warnings.push(`Ticket type \`${type.key}\` category no longer exists.`);
      }

      if (!type.staff_role_id) {
        warnings.push(`Ticket type \`${type.key}\` has no staff role configured.`);
      } else if (!message.guild.roles.cache.get(type.staff_role_id)) {
        warnings.push(`Ticket type \`${type.key}\` staff role no longer exists.`);
      }
    }

    if (!warnings.length) {
      return send(message, 'good', 'Ticket panel validation passed. Everything looks ready.');
    }

    return send(message, 'bad', 'Ticket panel validation found issues.', [
      {
        name: 'Warnings',
        value: warnings.slice(0, 15).map((item) => `• ${item}`).join('\n')
      }
    ]);
  }

  if (action === 'publish') {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(cleanId(args[0])) ||
      message.channel;

    const panel = await getPanel(message.guild.id);
    const types = await getTypes(message.guild.id);

    if (!panel) {
      return send(message, 'bad', 'Create a panel first with `ticket panel create`.');
    }

    if (!types.length) {
      return send(message, 'bad', 'Add at least one ticket type first with `ticket type add support Support`.');
    }

    const enabledTypes = types.filter((type) => type.enabled).slice(0, 7);

    const embed = new EmbedBuilder()
      .setColor(hexToNumber(panel.panel_color))
      .setDescription(`${TICKET_EMOJI} ${panel.panel_description}`);

    if (panel.panel_image) embed.setImage(panel.panel_image);
    if (panel.panel_thumbnail) embed.setThumbnail(panel.panel_thumbnail);

    let row;

    if ((panel.panel_mode || 'buttons') === 'dropdown') {
      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket:select')
        .setPlaceholder('Choose a ticket type')
        .addOptions(
          enabledTypes.map((type) =>
            new StringSelectMenuOptionBuilder()
              .setLabel(type.name.slice(0, 100))
              .setDescription((type.description || `Open a ${type.name} ticket`).slice(0, 100))
              .setValue(type.key)
          )
        );

      row = new ActionRowBuilder().addComponents(menu);
    } else {
      const buttons = enabledTypes.slice(0, 5).map((type) =>
        new ButtonBuilder()
          .setCustomId(`ticket:create:${type.key}`)
          .setLabel(type.name.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
      );

      row = new ActionRowBuilder().addComponents(buttons);
    }

    const sent = await channel.send({
      embeds: [embed],
      components: [row],
      allowedMentions: { parse: [] }
    });

    await db.exec(
      `
      update ticket_panels
      set channel_id = $2, message_id = $3, updated_at = now()
      where guild_id = $1
      `,
      [message.guild.id, channel.id, sent.id]
    );

    return send(message, 'good', `Ticket panel published in ${channel}.`);
  }

  return send(
    message,
    'info',
    'Panel usage: `ticket panel <create|view|message|color|image|thumbnail|mode|preview|validate|publish>`.'
  );
}

async function cmdType({ message, args }) {
  const action = (args.shift() || 'list').toLowerCase();

  if (action === 'add') {
    const key = slug(args.shift());
    const name = args.join(' ').trim();

    if (!key || !name) {
      return send(message, 'info', 'Usage: `ticket type add <key> <name>`.');
    }

    const types = await getTypes(message.guild.id);

    if (types.length >= 7) {
      return send(message, 'bad', 'Free servers can create up to 7 ticket types.');
    }

    const existing = await getType(message.guild.id, key);

    if (existing) {
      return send(message, 'bad', `Ticket type \`${key}\` already exists.`);
    }

    await db.exec(
      `
      insert into ticket_types (guild_id, key, name)
      values ($1, $2, $3)
      `,
      [message.guild.id, key, name]
    );

    return send(message, 'good', `Ticket type \`${key}\` created.`);
  }

  if (action === 'list') {
    const types = await getTypes(message.guild.id);

    if (!types.length) {
      return send(message, 'info', 'No ticket types exist yet. Use `ticket type add support Support`.');
    }

    return send(message, 'list', 'Ticket types for this server.', [
      {
        name: 'Types',
        value: types
          .map((type) => {
            const state = type.enabled ? 'enabled' : 'disabled';
            return `\`${type.key}\` — ${type.name} (${state})`;
          })
          .join('\n')
      }
    ]);
  }

  if (action === 'view') {
    const key = slug(args.shift());
    const type = await getType(message.guild.id, key);

    if (!type) {
      return send(message, 'bad', `Ticket type \`${key}\` does not exist.`);
    }

    return send(message, 'list', `Ticket type \`${type.key}\`.`, [
      {
        name: 'Name',
        value: type.name,
        inline: true
      },
      {
        name: 'Enabled',
        value: String(type.enabled),
        inline: true
      },
      {
        name: 'Category',
        value: type.category_id ? `<#${type.category_id}>` : 'not set',
        inline: true
      },
      {
        name: 'Staff role',
        value: type.staff_role_id ? `<@&${type.staff_role_id}>` : 'not set',
        inline: true
      },
      {
        name: 'Limits',
        value: `Max open: ${type.max_open_per_user}\nCooldown: ${msToText(Number(type.cooldown_ms))}`,
        inline: true
      }
    ]);
  }

  if (action === 'remove' || action === 'delete') {
    const key = slug(args.shift());

    if (!key) {
      return send(message, 'info', 'Usage: `ticket type remove <key>`.');
    }

    await db.exec(
      'delete from ticket_types where guild_id = $1 and key = $2',
      [message.guild.id, key]
    );

    return send(message, 'good', `Ticket type \`${key}\` removed.`);
  }

  if (action === 'enable' || action === 'disable') {
    const key = slug(args.shift());
    const enabled = action === 'enable';

    await db.exec(
      `
      update ticket_types
      set enabled = $3, updated_at = now()
      where guild_id = $1 and key = $2
      `,
      [message.guild.id, key, enabled]
    );

    return send(message, 'good', `Ticket type \`${key}\` ${enabled ? 'enabled' : 'disabled'}.`);
  }

  return send(message, 'info', 'Type usage: `ticket type <add|list|view|remove|enable|disable>`.');
}

async function cmdSettings({ message, args }) {
  const setting = (args.shift() || '').toLowerCase();
  const key = slug(args.shift());

  if (!setting || !key) {
    return send(
      message,
      'info',
      'Usage: `ticket settings <category|staffrole|logchannel|transcriptchannel|maxopen|cooldown|channelname|welcome> <type> <value>`.'
    );
  }

  const type = await getType(message.guild.id, key);

  if (!type) {
    return send(message, 'bad', `Ticket type \`${key}\` does not exist.`);
  }

  if (setting === 'category') {
    const category =
      message.guild.channels.cache.get(cleanId(args[0])) ||
      message.mentions.channels.first();

    if (!category || category.type !== ChannelType.GuildCategory) {
      return send(message, 'bad', 'Please provide a valid category ID.');
    }

    await db.exec(
      'update ticket_types set category_id = $3, updated_at = now() where guild_id = $1 and key = $2',
      [message.guild.id, key, category.id]
    );

    return send(message, 'good', `Ticket category for \`${key}\` set to **${category.name}**.`);
  }

  if (setting === 'staffrole') {
    const role =
      message.mentions.roles.first() ||
      message.guild.roles.cache.get(cleanId(args[0]));

    if (!role) {
      return send(message, 'bad', 'Please provide a valid staff role.');
    }

    await db.exec(
      'update ticket_types set staff_role_id = $3, updated_at = now() where guild_id = $1 and key = $2',
      [message.guild.id, key, role.id]
    );

    return send(message, 'good', `Staff role for \`${key}\` set to ${role}.`);
  }

  if (setting === 'logchannel' || setting === 'transcriptchannel') {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(cleanId(args[0]));

    if (!channel) {
      return send(message, 'bad', 'Please provide a valid channel.');
    }

    const column = setting === 'logchannel' ? 'log_channel_id' : 'transcript_channel_id';

    await db.exec(
      `update ticket_types set ${column} = $3, updated_at = now() where guild_id = $1 and key = $2`,
      [message.guild.id, key, channel.id]
    );

    return send(message, 'good', `${setting} for \`${key}\` set to ${channel}.`);
  }

  if (setting === 'maxopen') {
    const value = Math.max(1, Math.min(20, Number(args[0] || 1)));

    await db.exec(
      'update ticket_types set max_open_per_user = $3, updated_at = now() where guild_id = $1 and key = $2',
      [message.guild.id, key, value]
    );

    return send(message, 'good', `Max open tickets for \`${key}\` set to **${value}**.`);
  }

  if (setting === 'cooldown') {
    const ms = parseDurationMs(args[0]);

    if (ms === null) {
      return send(message, 'bad', 'Use a duration like `30s`, `10m`, `2h`, or `1d`.');
    }

    await db.exec(
      'update ticket_types set cooldown_ms = $3, updated_at = now() where guild_id = $1 and key = $2',
      [message.guild.id, key, ms]
    );

    return send(message, 'good', `Cooldown for \`${key}\` set to **${msToText(ms)}**.`);
  }

  if (setting === 'channelname') {
    const format = args.join(' ').trim();

    if (!format) {
      return send(message, 'info', 'Example: `ticket settings channelname support support-{username}`.');
    }

    await db.exec(
      'update ticket_types set channel_name_format = $3, updated_at = now() where guild_id = $1 and key = $2',
      [message.guild.id, key, format.slice(0, 80)]
    );

    return send(message, 'good', `Channel name format for \`${key}\` updated.`);
  }

  if (setting === 'welcome') {
    const text = args.join(' ').trim();

    if (!text) {
      return send(message, 'info', 'Example: `ticket settings welcome support Welcome {user_mention}`.');
    }

    await db.exec(
      'update ticket_types set welcome_message = $3, updated_at = now() where guild_id = $1 and key = $2',
      [message.guild.id, key, text.slice(0, 1500)]
    );

    return send(message, 'good', `Welcome message for \`${key}\` updated.`);
  }

  return send(message, 'info', 'Unknown ticket setting.');
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

async function createTicket(message, key, opener = message.member) {
  const type = await getType(message.guild.id, key);

  if (!type) {
    return send(message, 'bad', `Ticket type \`${key}\` does not exist.`);
  }

  if (!type.enabled) {
    return send(message, 'bad', `Ticket type \`${key}\` is currently disabled.`);
  }

  if (!type.category_id) {
    return send(message, 'bad', 'This ticket type has no category configured. Ask an administrator to run `ticket settings category`.');
  }

  const category = message.guild.channels.cache.get(type.category_id);

  if (!category) {
    return send(message, 'bad', 'The configured ticket category no longer exists. Please contact an administrator.');
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
    [message.guild.id, opener.id, key]
  );

  if (openCount && openCount.count >= type.max_open_per_user) {
    return send(message, 'bad', `You already have an open ${type.name} ticket.`);
  }

  const cooldown = await db.one(
    `
    select last_opened_at
    from ticket_cooldowns
    where guild_id = $1 and user_id = $2 and type_key = $3
    `,
    [message.guild.id, opener.id, key]
  );

  if (cooldown && Number(type.cooldown_ms) > 0) {
    const last = new Date(cooldown.last_opened_at).getTime();
    const remaining = last + Number(type.cooldown_ms) - Date.now();

    if (remaining > 0) {
      return send(message, 'bad', `Please wait **${msToText(remaining)}** before opening another ${type.name} ticket.`);
    }
  }

  const id = `TCK-${ticketNumber()}`;
  const number = ticketNumber();

  const rawName = renderTemplate(type.channel_name_format, {
    username: opener.user.username,
    userId: opener.id,
    ticketType: key,
    ticketId: id,
    ticketNumber: number,
    serverName: message.guild.name
  });

  const channelName = slug(rawName || `${key}-${opener.user.username}`);

  const overwrites = [
    {
      id: message.guild.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: message.client.user.id,
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

  if (type.staff_role_id) {
    overwrites.push({
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

  const channel = await message.guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: overwrites,
    topic: `Ticket ${id} | Type: ${key} | Opened by ${opener.user.tag} (${opener.id})`
  });

  await db.exec(
    `
    insert into tickets (guild_id, ticket_id, ticket_number, type_key, channel_id, opener_id)
    values ($1, $2, $3, $4, $5, $6)
    `,
    [message.guild.id, id, number, key, channel.id, opener.id]
  );

  await db.exec(
    `
    insert into ticket_cooldowns (guild_id, user_id, type_key, last_opened_at)
    values ($1, $2, $3, now())
    on conflict (guild_id, user_id, type_key)
    do update set last_opened_at = now()
    `,
    [message.guild.id, opener.id, key]
  );

  const welcome = renderTemplate(type.welcome_message, {
    username: opener.user.username,
    userId: opener.id,
    ticketType: type.name,
    ticketId: id,
    ticketNumber: number,
    serverName: message.guild.name
  });

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ticket:claim')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('ticket:close')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
  );

  await channel.send({
    content: `<@${opener.id}>`,
    embeds: [makeEmbed('list', welcome)],
    components: [buttons],
    allowedMentions: { users: [opener.id], roles: [] }
  });

  await logTicket(message.guild.id, id, 'ticket_opened', opener.id, {
    channelId: channel.id,
    typeKey: key
  });

  if (type.log_channel_id) {
    const logChannel = message.guild.channels.cache.get(type.log_channel_id);

    if (logChannel) {
      await logChannel.send({
        embeds: [
          makeEmbed('list', 'Ticket opened.', [
            {
              name: 'Ticket',
              value: `\`${id}\``,
              inline: true
            },
            {
              name: 'Type',
              value: type.name,
              inline: true
            },
            {
              name: 'Opened by',
              value: `<@${opener.id}>`,
              inline: true
            },
            {
              name: 'Channel',
              value: `<#${channel.id}>`,
              inline: true
            }
          ])
        ],
        allowedMentions: { parse: [] }
      });
    }
  }

  return message.channel.send({
    embeds: [makeEmbed('good', `Ticket created: ${channel}`)],
    allowedMentions: { parse: [] }
  });
}

async function getTicketByChannel(guildId, channelId) {
  await ensureTables();

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

async function cmdOpen({ message, args }) {
  const key = slug(args.shift());

  if (!key) {
    return send(message, 'info', 'Usage: `ticket open <type>`.');
  }

  return createTicket(message, key, message.member);
}

async function cmdClaim({ message }) {
  const ticket = await getTicketByChannel(message.guild.id, message.channel.id);

  if (!ticket) {
    return send(message, 'bad', 'This channel is not a ticket.');
  }

  if (ticket.claimed_by) {
    return send(message, 'bad', `This ticket is already claimed by <@${ticket.claimed_by}>.`);
  }

  await db.exec(
    `
    update tickets
    set claimed_by = $3, claimed_at = now(), status = 'claimed'
    where guild_id = $1 and channel_id = $2
    `,
    [message.guild.id, message.channel.id, message.author.id]
  );

  await logTicket(message.guild.id, ticket.ticket_id, 'ticket_claimed', message.author.id);

  return send(message, 'good', `Ticket claimed by ${message.author}.`);
}

async function cmdUnclaim({ message }) {
  const ticket = await getTicketByChannel(message.guild.id, message.channel.id);

  if (!ticket) {
    return send(message, 'bad', 'This channel is not a ticket.');
  }

  await db.exec(
    `
    update tickets
    set claimed_by = null, claimed_at = null, status = 'open'
    where guild_id = $1 and channel_id = $2
    `,
    [message.guild.id, message.channel.id]
  );

  await logTicket(message.guild.id, ticket.ticket_id, 'ticket_unclaimed', message.author.id);

  return send(message, 'good', 'Ticket unclaimed.');
}

async function cmdClose({ message, args }) {
  const ticket = await getTicketByChannel(message.guild.id, message.channel.id);

  if (!ticket) {
    return send(message, 'bad', 'This channel is not a ticket.');
  }

  const reason = args.join(' ').trim() || 'No reason provided.';

  await db.exec(
    `
    update tickets
    set status = 'closed',
        closed_by = $3,
        close_reason = $4,
        closed_at = now()
    where guild_id = $1 and channel_id = $2
    `,
    [message.guild.id, message.channel.id, message.author.id, reason]
  );

  await message.channel.permissionOverwrites.edit(ticket.opener_id, {
    SendMessages: false,
    ViewChannel: true
  }).catch(() => null);

  await logTicket(message.guild.id, ticket.ticket_id, 'ticket_closed', message.author.id, {
    reason
  });

  return send(message, 'good', `Ticket closed. Reason: ${reason}`);
}

async function cmdReopen({ message }) {
  const ticket = await getTicketByChannel(message.guild.id, message.channel.id);

  if (!ticket) {
    return send(message, 'bad', 'This channel is not a ticket.');
  }

  await db.exec(
    `
    update tickets
    set status = 'open',
        closed_by = null,
        close_reason = null,
        closed_at = null
    where guild_id = $1 and channel_id = $2
    `,
    [message.guild.id, message.channel.id]
  );

  await message.channel.permissionOverwrites.edit(ticket.opener_id, {
    SendMessages: true,
    ViewChannel: true
  }).catch(() => null);

  await logTicket(message.guild.id, ticket.ticket_id, 'ticket_reopened', message.author.id);

  return send(message, 'good', 'Ticket reopened.');
}

async function cmdAddRemove({ message, args, mode }) {
  const ticket = await getTicketByChannel(message.guild.id, message.channel.id);

  if (!ticket) {
    return send(message, 'bad', 'This channel is not a ticket.');
  }

  const member =
    message.mentions.members.first() ||
    message.guild.members.cache.get(cleanId(args[0]));

  if (!member) {
    return send(message, 'bad', `Usage: \`ticket ${mode} @user\`.`);
  }

  if (mode === 'add') {
    await message.channel.permissionOverwrites.edit(member.id, {
      ViewChannel: true,
      SendMessages: true,
      ReadMessageHistory: true,
      AttachFiles: true,
      EmbedLinks: true
    });

    await logTicket(message.guild.id, ticket.ticket_id, 'ticket_user_added', message.author.id, {
      userId: member.id
    });

    return send(message, 'good', `${member} added to the ticket.`);
  }

  await message.channel.permissionOverwrites.delete(member.id).catch(() => null);

  await logTicket(message.guild.id, ticket.ticket_id, 'ticket_user_removed', message.author.id, {
    userId: member.id
  });

  return send(message, 'good', `${member} removed from the ticket.`);
}

async function cmdTranscript({ message }) {
  const ticket = await getTicketByChannel(message.guild.id, message.channel.id);

  if (!ticket) {
    return send(message, 'bad', 'This channel is not a ticket.');
  }

  const messages = await message.channel.messages.fetch({ limit: 100 });
  const ordered = [...messages.values()].reverse();

  const lines = [
    `Ticket Transcript`,
    `Ticket ID: ${ticket.ticket_id}`,
    `Type: ${ticket.type_key}`,
    `Opened By: ${ticket.opener_id}`,
    `Claimed By: ${ticket.claimed_by || 'none'}`,
    `Status: ${ticket.status}`,
    `Close Reason: ${ticket.close_reason || 'none'}`,
    '',
    'Messages:',
    ''
  ];

  for (const msg of ordered) {
    const content = msg.content || '[no text content]';
    const attachments = msg.attachments.size
      ? ` Attachments: ${msg.attachments.map((a) => a.url).join(', ')}`
      : '';

    lines.push(`[${msg.createdAt.toISOString()}] ${msg.author.tag}: ${content}${attachments}`);
  }

  const buffer = Buffer.from(lines.join('\n'), 'utf8');

  await logTicket(message.guild.id, ticket.ticket_id, 'ticket_transcript_generated', message.author.id);

  return message.channel.send({
    embeds: [makeEmbed('good', 'Transcript generated.')],
    files: [
      {
        attachment: buffer,
        name: `${ticket.ticket_id}-transcript.txt`
      }
    ],
    allowedMentions: { parse: [] }
  });
}

async function cmdDelete({ message }) {
  const ticket = await getTicketByChannel(message.guild.id, message.channel.id);

  if (!ticket) {
    return send(message, 'bad', 'This channel is not a ticket.');
  }

  await logTicket(message.guild.id, ticket.ticket_id, 'ticket_deleted', message.author.id);

  await message.channel.send({
    embeds: [makeEmbed('good', 'Deleting ticket channel in 3 seconds.')],
    allowedMentions: { parse: [] }
  });

  setTimeout(() => {
    message.channel.delete('Ticket deleted').catch(() => null);
  }, 3000);
}

module.exports = {
  name: 'ticket',
  aliases: ['tickets'],
  category: 'tickets',
  description: 'Create and manage ticket panels, ticket types, and ticket channels.',
  usage: '<panel|type|settings|open|claim|unclaim|close|reopen|add|remove|transcript|delete>',
  examples: [
    'ticket panel create',
    'ticket type add support Support',
    'ticket settings category support 123456789012345678',
    'ticket settings staffrole support @Staff',
    'ticket panel publish #support',
    'ticket open support'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.ReadMessageHistory
  ],

  async execute(ctx) {
    const { message, args } = ctx;

    await ensureTables();

    const sub = (args.shift() || 'panel').toLowerCase();

    if (sub === 'panel') return cmdPanel({ message, args });
    if (sub === 'type') return cmdType({ message, args });
    if (sub === 'settings' || sub === 'setting') return cmdSettings({ message, args });
    if (sub === 'open') return cmdOpen({ message, args });
    if (sub === 'claim') return cmdClaim({ message, args });
    if (sub === 'unclaim') return cmdUnclaim({ message, args });
    if (sub === 'close') return cmdClose({ message, args });
    if (sub === 'reopen') return cmdReopen({ message, args });
    if (sub === 'add') return cmdAddRemove({ message, args, mode: 'add' });
    if (sub === 'remove') return cmdAddRemove({ message, args, mode: 'remove' });
    if (sub === 'transcript') return cmdTranscript({ message, args });
    if (sub === 'delete') return cmdDelete({ message, args });

    return send(
      message,
      'info',
      'Usage: `ticket <panel|type|settings|open|claim|unclaim|close|reopen|add|remove|transcript|delete>`.'
    );
  }
};