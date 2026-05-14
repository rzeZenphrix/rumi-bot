const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { updateGuildLogConfig, getGuildLogConfig, DEFAULT_EVENTS } = require('../../systems/logging/logConfigStore');
const { info, ok, bad, extractId } = require('../../utils/moderationSimple');
const db = require('../../services/database');

function parseColor(input) {
  const raw = String(input || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw}` : null;
}

function normalizeEvent(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  return DEFAULT_EVENTS.find((event) => event.toLowerCase() === raw.toLowerCase()) || null;
}

async function createLogWebhook(channel, user) {
  const existing = await channel.fetchWebhooks().catch(() => null);
  const old = existing?.find?.((hook) => hook.name === 'Rumi Logs' && hook.owner?.id === channel.client.user.id);
  if (old?.url) return old;

  return channel.createWebhook({
    name: 'Rumi Logs',
    avatar: channel.client.user.displayAvatarURL(),
    reason: `Logging webhook created by ${user.tag}`
  });
}

module.exports = {
  name: 'logs',
  aliases: ['log', 'logging'],
  category: 'logging',
  description: 'Configure server logs.',
  usage: 'logs [#channel|off|events|remove|color]',
  examples: ['logs #mod-logs', 'logs #message-logs messageDelete', 'logs off', 'logs events'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],

  async execute({ message, args }) {
    const first = (args.shift() || '').toLowerCase();

    if (!first) {
      const cfg = await getGuildLogConfig(message.guild.id);
      const routes = Object.entries(cfg.channels || {}).map(([event, channelId]) => `${event}: <#${channelId}>`);
      return info(message, `Logging: ${cfg.enabled ? 'on' : 'off'}\n${routes.join('\n') || 'No routes set.'}`);
    }

    if (first === 'off' || first === 'disable') {
      await updateGuildLogConfig(message.guild.id, (cfg) => { cfg.enabled = false; });
      return ok(message, 'Logging disabled.');
    }

    if (first === 'events') {
      return info(message, DEFAULT_EVENTS.map((event) => `\`${event}\``).join(', '));
    }

    if (first === 'errors' || first === 'bugs') {
      const rows = await db.listErrorLogs({
        guildId: message.guild.id,
        resolved: args[0]?.toLowerCase() === 'resolved' ? true : false,
        limit: 8
      }).catch(() => []);

      if (!rows.length) {
        return info(message, 'No unresolved bot error logs are stored for this server.');
      }

      return info(message, rows.map((row) => [
        `\`${row.id}\``,
        `${row.command_name || row.event_name || row.source || 'unknown'} - ${row.error_type || 'Error'}`,
        String(row.error_message || 'No message').slice(0, 140)
      ].join('\n')).join('\n\n'));
    }

    if (first === 'resolve-error') {
      const logId = args.shift();
      if (!logId) return info(message, 'Usage: `logs resolve-error <error-log-id> [notes]`.');

      await db.markErrorLogResolved(logId, message.author.id, args.join(' ') || null);
      return ok(message, 'Marked that error log as resolved.');
    }

    if (first === 'remove' || first === 'del') {
      const target = args.shift();
      if (!target) return info(message, '> Remove a log event or channel.\n \n`logs remove <event|#channel>`\n \n**Example**\n \n`logs remove messageDelete`');

      await updateGuildLogConfig(message.guild.id, (cfg) => {
        const targetId = extractId(target);
        for (const [event, channelId] of Object.entries(cfg.channels || {})) {
          if (event.toLowerCase() === target.toLowerCase() || channelId === targetId) {
            delete cfg.channels[event];
            delete cfg.webhooks[event];
          }
        }
      });

      return ok(message, 'Removed matching log route.');
    }

    if (first === 'color') {
      const color = parseColor(args.shift());
      const event = normalizeEvent(args.shift()) || 'all';
      if (!color || !DEFAULT_EVENTS.includes(event)) return info(message, '> Set the embed color for a log event.\n \n`logs color <#hex> [event|all]`\n \n**Example**\n \n`logs color #ff0000 messageDelete`');

      await updateGuildLogConfig(message.guild.id, (cfg) => {
        cfg.colors[event] = color;
      });

      return ok(message, `Set ${event} color to ${color}.`);
    }

    let event = normalizeEvent(first);
    let channelToken = event ? args.shift() : first;
    let channelId = extractId(channelToken);
    let channel = channelId ? await message.guild.channels.fetch(channelId).catch(() => null) : null;

    if (!event) {
      event = normalizeEvent(args.shift()) || 'all';
    }

    if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
      return info(message, '> Configure server logs.\n \n`logs <#channel> [event|all]`\n`logs <event|all> <#channel>`\n`logs events`\n \n**Example**\n \n`logs #message-logs messageDelete`\n`logs all #server-logs`');
    }

    if (!DEFAULT_EVENTS.includes(event)) return bad(message, 'Unknown log event. Use `logs events`.');

    const webhook = await createLogWebhook(channel, message.author);

    await updateGuildLogConfig(message.guild.id, (cfg) => {
      cfg.enabled = true;
      cfg.channels[event] = channel.id;
      cfg.webhooks[event] = {
        id: webhook.id,
        token: webhook.token,
        url: webhook.url,
        channelId: channel.id
      };
    });

    return ok(message, `Logging ${event} to #${channel.name}.`);
  }
};
