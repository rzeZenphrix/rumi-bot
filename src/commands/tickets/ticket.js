const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');

const ticketDb = require('../../systems/tickets/ticketDb');
const ticketManager = require('../../systems/tickets/ticketManager');
const db = require('../../services/database');
const respond = require('../../utils/respond');
const emojis = require('../../utils/botEmojis');

const TICKET_EMOJI = emojis.info;
const PANEL_SELECTION_NAMESPACE = 'tickets:selectedPanel';

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
  const seconds = ticketManager.parseDurationToSeconds(input);
  return Number.isFinite(seconds) ? seconds * 1000 : null;
}

function msToText(ms) {
  if (!ms) return 'none';

  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function makeEmbed(type, description, fields = []) {
  const embed = respond.makeEmbed(type, null, description, {
    mentionUser: false,
    fields
  });

  return embed;
}

async function send(message, type, description, fields = []) {
  return message.channel.send({
    embeds: [respond.styleEmbed(makeEmbed(type, description, fields), type, message.author, { message, prefixEmoji: false })],
    allowedMentions: { parse: [] }
  });
}

async function getSelectedPanelId(guildId) {
  const state = await db.getKv(PANEL_SELECTION_NAMESPACE, guildId, { panelId: null });
  return state?.panelId || null;
}

async function setSelectedPanelId(guildId, panelId) {
  await db.setKv(PANEL_SELECTION_NAMESPACE, guildId, { panelId: panelId || null });
}

async function getConfiguredPanel(guildId) {
  const selectedId = await getSelectedPanelId(guildId).catch(() => null);
  if (selectedId) {
    const selected = await ticketDb.getPanel(guildId, selectedId).catch(() => null);
    if (selected) return selected;
  }

  const firstPanel = await ticketDb.getPanel(guildId).catch(() => null);
  if (firstPanel?.id) {
    await setSelectedPanelId(guildId, firstPanel.id).catch(() => null);
  }
  return firstPanel;
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

async function getCurrentTicket(guildId, channelId) {
  return ticketDb.getTicketByChannel(guildId, channelId);
}

function previewPanelEmbed(panel, types) {
  const embed = new EmbedBuilder()
    .setColor(hexToNumber(panel.panel_color))
    .setDescription(`${TICKET_EMOJI} ${panel.description || 'Need help? Choose a ticket type below.'}`);

  if (panel.panel_image) embed.setImage(panel.panel_image);
  if (panel.panel_thumbnail) embed.setThumbnail(panel.panel_thumbnail);

  if (types.length) {
    embed.addFields({
      name: 'Available ticket types',
      value: types
        .filter((type) => type.enabled)
        .slice(0, 10)
        .map((type) => `${type.emoji || TICKET_EMOJI} **${type.name}** - ${type.description || 'Open a ticket.'}`)
        .join('\n')
        .slice(0, 1024)
    });
  }

  return embed;
}

async function cmdPanel({ message, args }) {
  const action = (args.shift() || 'view').toLowerCase();

  if (action === 'create') {
    const name = args.join(' ').trim() || 'Main Ticket Panel';
    let panel;
    try {
      panel = await ticketDb.createPanel({
        guildId: message.guild.id,
        userId: message.author.id,
        name
      });
    } catch (error) {
      if (error.code === 'FREE_PANEL_LIMIT') {
        return send(message, 'bad', 'Free servers can publish one ticket panel. Server premium removes the panel cap.');
      }
      throw error;
    }

    await setSelectedPanelId(message.guild.id, panel.id).catch(() => null);

    return send(message, 'good', 'Ticket panel created for this server.', [
      { name: 'Panel ID', value: `\`${panel.id}\``, inline: true },
      { name: 'Panel name', value: panel.name || 'Main Ticket Panel', inline: true },
      { name: 'Next step', value: '`ticket type add support Support`', inline: true }
    ]);
  }

  if (action === 'list') {
    const panels = await ticketDb.listPanels(message.guild.id);
    const selectedId = await getSelectedPanelId(message.guild.id).catch(() => null);

    if (!panels.length) {
      return send(message, 'info', 'No ticket panels exist yet. Use `ticket panel create`.');
    }

    return send(message, 'list', 'Ticket panels for this server.', [
      {
        name: 'Panels',
        value: panels
          .map((panel) => `${panel.id === selectedId ? '-> ' : ''}\`${panel.id}\` - ${panel.name || 'Unnamed panel'}`)
          .join('\n')
          .slice(0, 1024)
      }
    ]);
  }

  if (action === 'use' || action === 'select') {
    const panelId = String(args.shift() || '').trim();
    if (!panelId) {
      return send(message, 'info', 'Usage: `ticket panel use <panel-id>`.');
    }

    const panel = await ticketDb.getPanel(message.guild.id, panelId).catch(() => null);
    if (!panel) {
      return send(message, 'bad', 'I could not find that ticket panel id in this server.');
    }

    await setSelectedPanelId(message.guild.id, panel.id);
    return send(message, 'good', `Selected **${panel.name || 'ticket panel'}** (\`${panel.id}\`) for ticket panel editing.`);
  }

  const panel = await getConfiguredPanel(message.guild.id);
  const types = panel ? await ticketDb.listTicketTypes(message.guild.id, panel.id) : [];

  if (action === 'view') {
    if (!panel) {
      return send(message, 'bad', 'No ticket panel exists yet. Use `ticket panel create`.');
    }

    return send(message, 'list', 'Ticket panel settings.', [
      { name: 'Panel', value: `${panel.name || 'Main Ticket Panel'} (\`${panel.id}\`)`, inline: false },
      { name: 'Mode', value: panel.mode || 'dropdown', inline: true },
      { name: 'Color', value: panel.panel_color || '#2b1a1d', inline: true },
      { name: 'Published', value: panel.panel_channel_id ? `<#${panel.panel_channel_id}>` : 'not published', inline: true },
      { name: 'Description', value: String(panel.description || 'No description.').slice(0, 1024) },
      { name: 'Ticket types', value: types.length ? types.map((type) => `\`${type.key}\``).join(', ') : 'none' }
    ]);
  }

  if (!panel) {
    return send(message, 'bad', 'No ticket panel exists yet. Use `ticket panel create`.');
  }

  if (action === 'message' || action === 'description') {
    const description = args.join(' ').trim();
    if (!description) {
      return send(message, 'info', 'Usage: `ticket panel message <description>`.');
    }

    await ticketDb.updatePanel(message.guild.id, {
      description: description.slice(0, 3500),
      updated_by: message.author.id
    }, panel.id);

    return send(message, 'good', 'Ticket panel description updated.');
  }

  if (action === 'color') {
    const color = args[0];
    if (!isHexColor(color)) {
      return send(message, 'bad', 'Use a valid hex color like `#8b5e3c`.');
    }

    await ticketDb.updatePanel(message.guild.id, {
      panel_color: normalizeHexColor(color),
      updated_by: message.author.id
    }, panel.id);

    return send(message, 'good', `Ticket panel color set to \`${normalizeHexColor(color)}\`.`);
  }

  if (action === 'image' || action === 'thumbnail') {
    const value = args.join(' ').trim();
    const column = action === 'image' ? 'panel_image' : 'panel_thumbnail';

    if (!value || ['none', 'remove'].includes(value.toLowerCase())) {
      await ticketDb.updatePanel(message.guild.id, {
        [column]: null,
        updated_by: message.author.id
      }, panel.id);

      return send(message, 'good', `Ticket panel ${action} removed.`);
    }

    if (!/^https?:\/\//i.test(value)) {
      return send(message, 'bad', 'Please provide a valid image URL or use `none`.');
    }

    await ticketDb.updatePanel(message.guild.id, {
      [column]: value,
      updated_by: message.author.id
    }, panel.id);

    return send(message, 'good', `Ticket panel ${action} updated.`);
  }

  if (action === 'mode') {
    const mode = String(args[0] || '').toLowerCase();

    if (!['buttons', 'dropdown'].includes(mode)) {
      return send(message, 'info', 'Usage: `ticket panel mode <buttons|dropdown>`.');
    }

    await ticketDb.updatePanel(message.guild.id, {
      mode,
      updated_by: message.author.id
    }, panel.id);

    return send(message, 'good', `Ticket panel mode set to **${mode}**.`);
  }

  if (action === 'preview') {
    return message.channel.send({
      embeds: [previewPanelEmbed(panel, types)],
      components: ticketManager.buildPanelComponents(types, panel.mode || 'dropdown', panel.id),
      allowedMentions: { parse: [] }
    });
  }

  if (action === 'validate') {
    const result = await ticketManager.validatePanel(message.guild, panel.id);
    return message.channel.send({
      embeds: [respond.styleEmbed(ticketManager.panelValidationEmbed(result), result.errors.length ? 'bad' : 'info', message.author, { message })],
      allowedMentions: { parse: [] }
    });
  }

  if (action === 'publish') {
    const channel =
      message.mentions.channels.first() ||
      message.guild.channels.cache.get(cleanId(args[0])) ||
      message.channel;

    try {
      await ticketManager.publishPanel({
        guild: message.guild,
        channel,
        mode: panel.mode || 'dropdown',
        userId: message.author.id,
        panelId: panel.id
      });

      return send(message, 'good', `Ticket panel **${panel.name || panel.id}** published in ${channel}.`);
    } catch (error) {
      if (error.validation) {
        return message.channel.send({
          embeds: [respond.styleEmbed(ticketManager.panelValidationEmbed(error.validation), error.validation.errors.length ? 'bad' : 'info', message.author, { message })],
          allowedMentions: { parse: [] }
        });
      }

      throw error;
    }
  }

  return send(message, 'info', 'Panel usage: `ticket panel <create|list|use|view|message|color|image|thumbnail|mode|preview|validate|publish>`.');
}

async function cmdType({ message, args }) {
  const action = (args.shift() || 'list').toLowerCase();
  const panel = await getConfiguredPanel(message.guild.id);

  if (!panel && action !== 'list') {
    return send(message, 'bad', 'Create a ticket panel first with `ticket panel create`.');
  }

  if (action === 'add') {
    const key = slug(args.shift());
    const name = args.join(' ').trim();

    if (!key || !name) {
      return send(message, 'info', 'Usage: `ticket type add <key> <name>`.');
    }

    try {
      await ticketDb.addTicketType({
        guildId: message.guild.id,
        panelId: panel.id,
        key,
        name,
        userId: message.author.id
      });
    } catch (error) {
      if (error.code === 'FREE_TYPE_LIMIT') {
        return send(message, 'bad', 'Free servers can create up to 7 ticket types.');
      }

      throw error;
    }

    return send(message, 'good', `Ticket type \`${key}\` created.`);
  }

  if (action === 'list') {
    const types = panel ? await ticketDb.listTicketTypes(message.guild.id, panel.id) : [];

    if (!types.length) {
      return send(message, 'info', panel ? `No ticket types exist yet for **${panel.name || panel.id}**. Use \`ticket type add support Support\`.` : 'No ticket types exist yet. Use `ticket panel create` first.');
    }

    return send(message, 'list', `Ticket types for ${panel?.name || 'this server'}.`, [
      {
        name: 'Types',
        value: types
          .map((type) => `\`${type.key}\` - ${type.name} (${type.enabled ? 'enabled' : 'disabled'})`)
          .join('\n')
      }
    ]);
  }

  const key = slug(args.shift());
  const type = await ticketDb.getTicketType(message.guild.id, key);

  if (!type) {
    return send(message, 'bad', `Ticket type \`${key}\` does not exist.`);
  }

  if (action === 'view') {
    return send(message, 'list', `Ticket type \`${type.key}\`.`, [
      { name: 'Name', value: type.name, inline: true },
      { name: 'Enabled', value: String(type.enabled), inline: true },
      { name: 'Category', value: type.category_id ? `<#${type.category_id}>` : 'not set', inline: true },
      { name: 'Staff roles', value: type.staff_role_ids?.length ? type.staff_role_ids.map((id) => `<@&${id}>`).join(', ') : 'not set', inline: true },
      { name: 'Limits', value: `Max open: ${type.max_open_per_user}\nCooldown: ${msToText(Number(type.cooldown_seconds || 0) * 1000)}`, inline: true }
    ]);
  }

  if (action === 'remove' || action === 'delete') {
    await ticketDb.removeTicketType(message.guild.id, key);
    return send(message, 'good', `Ticket type \`${key}\` removed.`);
  }

  if (action === 'enable' || action === 'disable') {
    await ticketDb.setTypeEnabled(message.guild.id, key, action === 'enable', message.author.id);
    return send(message, 'good', `Ticket type \`${key}\` ${action}d.`);
  }

  return send(message, 'info', 'Type usage: `ticket type <add|list|view|remove|enable|disable>`.');
}

async function cmdSettings({ message, args }) {
  const setting = (args.shift() || '').toLowerCase();
  const key = slug(args.shift());

  if (!setting || !key) {
    return send(message, 'info', 'Usage: `ticket settings <category|staffrole|logchannel|transcriptchannel|maxopen|cooldown|channelname|welcome> <type> <value>`.');
  }

  const type = await ticketDb.getTicketType(message.guild.id, key);
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

    await ticketDb.updateTicketType(message.guild.id, key, {
      category_id: category.id
    }, message.author.id);

    return send(message, 'good', `Ticket category for \`${key}\` set to **${category.name}**.`);
  }

  if (setting === 'staffrole') {
    const role = message.mentions.roles.first() || message.guild.roles.cache.get(cleanId(args[0]));
    if (!role) {
      return send(message, 'bad', 'Please provide a valid staff role.');
    }

    await ticketDb.updateTicketType(message.guild.id, key, {
      staff_role_ids: [role.id],
      claim_role_ids: [role.id],
      close_role_ids: [role.id],
      reopen_role_ids: [role.id],
      participant_manage_role_ids: [role.id],
      transcript_role_ids: [role.id]
    }, message.author.id);

    return send(message, 'good', `Staff role for \`${key}\` set to ${role}.`);
  }

  if (setting === 'logchannel' || setting === 'transcriptchannel') {
    const channel = message.mentions.channels.first() || message.guild.channels.cache.get(cleanId(args[0]));
    if (!channel) {
      return send(message, 'bad', 'Please provide a valid channel.');
    }

    await ticketDb.updateTicketType(message.guild.id, key, {
      [setting === 'logchannel' ? 'log_channel_id' : 'transcript_channel_id']: channel.id
    }, message.author.id);

    return send(message, 'good', `${setting} for \`${key}\` set to ${channel}.`);
  }

  if (setting === 'maxopen') {
    const value = Math.max(1, Math.min(20, Number(args[0] || 1)));
    await ticketDb.updateTicketType(message.guild.id, key, {
      max_open_per_user: value
    }, message.author.id);

    return send(message, 'good', `Max open tickets for \`${key}\` set to **${value}**.`);
  }

  if (setting === 'cooldown') {
    const ms = parseDurationMs(args[0]);
    if (ms === null) {
      return send(message, 'bad', 'Use a duration like `30s`, `10m`, `2h`, or `1d`.');
    }

    await ticketDb.updateTicketType(message.guild.id, key, {
      cooldown_seconds: Math.floor(ms / 1000)
    }, message.author.id);

    return send(message, 'good', `Cooldown for \`${key}\` set to **${msToText(ms)}**.`);
  }

  if (setting === 'channelname') {
    const format = args.join(' ').trim();
    if (!format) {
      return send(message, 'info', 'Example: `ticket settings channelname support support-{username}`.');
    }

    await ticketDb.updateTicketType(message.guild.id, key, {
      channel_name_format: format.slice(0, 80)
    }, message.author.id);

    return send(message, 'good', `Channel name format for \`${key}\` updated.`);
  }

  if (setting === 'welcome') {
    const text = args.join(' ').trim();
    if (!text) {
      return send(message, 'info', 'Example: `ticket settings welcome support Welcome {user_mention}`.');
    }

    await ticketDb.updateTicketType(message.guild.id, key, {
      welcome_message: text.slice(0, 1500)
    }, message.author.id);

    return send(message, 'good', `Welcome message for \`${key}\` updated.`);
  }

  return send(message, 'info', 'Unknown ticket setting.');
}

async function cmdOpen({ message, args }) {
  const key = slug(args.shift());
  if (!key) {
    return send(message, 'info', 'Usage: `ticket open <type>`.');
  }

  const result = await ticketManager.openTicket({
    guild: message.guild,
    member: message.member,
    typeKey: key
  });

  if (!result.ok) {
    return send(message, 'bad', result.reason);
  }

  return send(message, 'good', `Ticket created: <#${result.channel.id}>`);
}

async function cmdClaim({ message }) {
  const ticket = await getCurrentTicket(message.guild.id, message.channel.id);
  if (!ticket) return send(message, 'bad', 'This channel is not a ticket.');

  const result = await ticketManager.claimTicket({
    guild: message.guild,
    member: message.member,
    ticketId: ticket.id
  });

  return send(message, result.ok ? 'good' : 'bad', result.ok ? `Ticket claimed by ${message.author}.` : result.reason);
}

async function cmdUnclaim({ message }) {
  const ticket = await getCurrentTicket(message.guild.id, message.channel.id);
  if (!ticket) return send(message, 'bad', 'This channel is not a ticket.');

  const result = await ticketManager.unclaimTicket({
    guild: message.guild,
    member: message.member,
    ticketId: ticket.id
  });

  return send(message, result.ok ? 'good' : 'bad', result.ok ? 'Ticket unclaimed.' : result.reason);
}

async function cmdClose({ message, args }) {
  const ticket = await getCurrentTicket(message.guild.id, message.channel.id);
  if (!ticket) return send(message, 'bad', 'This channel is not a ticket.');

  const reason = args.join(' ').trim() || 'No reason provided.';
  const result = await ticketManager.closeTicket({
    guild: message.guild,
    member: message.member,
    ticketId: ticket.id,
    reason
  });

  return send(message, result.ok ? 'good' : 'bad', result.ok ? `Ticket closed. Reason: ${reason}` : result.reason);
}

async function cmdReopen({ message }) {
  const ticket = await getCurrentTicket(message.guild.id, message.channel.id);
  if (!ticket) return send(message, 'bad', 'This channel is not a ticket.');

  const result = await ticketManager.reopenTicket({
    guild: message.guild,
    member: message.member,
    ticketId: ticket.id
  });

  return send(message, result.ok ? 'good' : 'bad', result.ok ? 'Ticket reopened.' : result.reason);
}

async function cmdAddRemove({ message, args, mode }) {
  const ticket = await getCurrentTicket(message.guild.id, message.channel.id);
  if (!ticket) return send(message, 'bad', 'This channel is not a ticket.');

  const member =
    message.mentions.members.first() ||
    message.guild.members.cache.get(cleanId(args[0]));

  if (!member) {
    return send(message, 'bad', `Usage: \`ticket ${mode} @user\`.`);
  }

  const result = mode === 'add'
    ? await ticketManager.addUserToTicket({
      guild: message.guild,
      member: message.member,
      targetUserId: member.id,
      ticketId: ticket.id
    })
    : await ticketManager.removeUserFromTicket({
      guild: message.guild,
      member: message.member,
      targetUserId: member.id,
      ticketId: ticket.id
    });

  return send(message, result.ok ? 'good' : 'bad', result.ok
    ? `${member} ${mode === 'add' ? 'added to' : 'removed from'} the ticket.`
    : result.reason);
}

async function cmdTranscript({ message }) {
  const ticket = await getCurrentTicket(message.guild.id, message.channel.id);
  if (!ticket) return send(message, 'bad', 'This channel is not a ticket.');

  const transcript = await ticketManager.generateTranscript({
    guild: message.guild,
    channel: message.channel,
    ticket,
    actorId: message.author.id
  });

  return message.channel.send({
    embeds: [respond.styleEmbed(makeEmbed('good', 'Transcript generated.'), 'good', message.author, { message, prefixEmoji: false })],
    files: [transcript.file],
    allowedMentions: { parse: [] }
  });
}

async function cmdDelete({ message }) {
  const ticket = await getCurrentTicket(message.guild.id, message.channel.id);
  if (!ticket) return send(message, 'bad', 'This channel is not a ticket.');

  await ticketDb.updateTicket(ticket.id, {
    status: 'deleted',
    closed_by: message.author.id,
    closed_at: new Date(),
    close_reason: 'Ticket channel deleted'
  });

  await ticketDb.logTicket({
    ticketId: ticket.id,
    guildId: message.guild.id,
    eventType: 'ticket_deleted',
    actorId: message.author.id,
    channelId: message.channel.id,
    details: 'Ticket channel deleted.'
  });

  await message.channel.send({
    embeds: [respond.styleEmbed(makeEmbed('good', 'Deleting ticket channel in 3 seconds.'), 'good', message.author, { message, prefixEmoji: false })],
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
  usage: 'ticket <panel|type|settings|open|claim|unclaim|close|reopen|add|remove|transcript|delete>',
  examples: [
    'ticket panel create',
    'ticket type add support Support',
    'ticket settings category support 123456789012345678',
    'ticket settings staffrole support @Staff',
    'ticket panel publish #support',
    'ticket open support'
  ],
  subcommands: [
    { name: 'panel', description: 'Create, preview, validate, and publish ticket panels.', usage: 'ticket panel <create|list|use|view|message|color|image|thumbnail|mode|preview|validate|publish> [input]', examples: ['ticket panel create', 'ticket panel publish #support'] },
    { name: 'type', description: 'Create, list, enable, disable, view, and remove ticket types.', usage: 'ticket type <add|list|view|remove|enable|disable> [input]', examples: ['ticket type add support Support', 'ticket type enable support'] },
    { name: 'settings', aliases: ['setting'], description: 'Change category, staff roles, cooldowns, limits, and ticket messages.', usage: 'ticket settings <category|staffrole|logchannel|transcriptchannel|maxopen|cooldown|channelname|welcome> <type> <value>', examples: ['ticket settings category support 123456789012345678', 'ticket settings staffrole support @Staff'] },
    { name: 'open', description: 'Open a new ticket from a configured ticket type.', usage: 'ticket open <type>', examples: ['ticket open support'] },
    { name: 'claim', description: 'Claim the current ticket.', usage: 'ticket claim', examples: ['ticket claim'] },
    { name: 'unclaim', description: 'Remove the current claim from a ticket.', usage: 'ticket unclaim', examples: ['ticket unclaim'] },
    { name: 'close', description: 'Close the current ticket with an optional reason.', usage: 'ticket close [reason]', examples: ['ticket close issue resolved'] },
    { name: 'reopen', description: 'Reopen the current ticket.', usage: 'ticket reopen', examples: ['ticket reopen'] },
    { name: 'add', description: 'Add a member to the current ticket.', usage: 'ticket add <@user|userId>', examples: ['ticket add @user'] },
    { name: 'remove', description: 'Remove a member from the current ticket.', usage: 'ticket remove <@user|userId>', examples: ['ticket remove @user'] },
    { name: 'transcript', description: 'Generate a transcript for the current ticket.', usage: 'ticket transcript', examples: ['ticket transcript'] },
    { name: 'delete', description: 'Delete the current ticket channel after marking it deleted.', usage: 'ticket delete', examples: ['ticket delete'] }
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

  async execute({ message, args }) {
    try {
      const sub = (args.shift() || 'panel').toLowerCase();

      if (sub === 'panel') return cmdPanel({ message, args });
      if (sub === 'type') return cmdType({ message, args });
      if (sub === 'settings' || sub === 'setting') return cmdSettings({ message, args });
      if (sub === 'open') return cmdOpen({ message, args });
      if (sub === 'claim') return cmdClaim({ message });
      if (sub === 'unclaim') return cmdUnclaim({ message });
      if (sub === 'close') return cmdClose({ message, args });
      if (sub === 'reopen') return cmdReopen({ message });
      if (sub === 'add') return cmdAddRemove({ message, args, mode: 'add' });
      if (sub === 'remove') return cmdAddRemove({ message, args, mode: 'remove' });
      if (sub === 'transcript') return cmdTranscript({ message });
      if (sub === 'delete') return cmdDelete({ message });

      return send(message, 'info', 'Usage: `ticket <panel|type|settings|open|claim|unclaim|close|reopen|add|remove|transcript|delete>`.');
    } catch (error) {
      if (
        error instanceof db.DatabaseUnavailableError ||
        error?.code === 'DATABASE_CIRCUIT_OPEN' ||
        /ticket/i.test(String(error?.message || ''))
      ) {
        return send(message, 'alert', 'Ticket storage is temporarily unavailable right now. Please try again in a moment.');
      }

      throw error;
    }
  }
};
