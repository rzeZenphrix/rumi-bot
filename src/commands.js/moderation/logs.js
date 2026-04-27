const { PermissionFlagsBits, ChannelType } = require('discord.js');
const respond = require('../../utils/respond');
const {
  updateGuildLogConfig,
  getGuildLogConfig,
  DEFAULT_EVENTS
} = require('../../systems/logging/logConfigStore');
const { extractId } = require('../../utils/resolveUser');

function channelId(input) {
  return String(input || '').match(/^<#(\d{17,20})>$/)?.[1] || extractId(input);
}

function roleId(input) {
  return String(input || '').match(/^<@&(\d{17,20})>$/)?.[1] || extractId(input);
}

function parseColor(input) {
  const raw = String(input || '').replace('#', '');
  return /^[0-9a-f]{6}$/i.test(raw) ? `#${raw}` : null;
}

function normalizeEvent(event) {
  if (!event) return 'all';
  return DEFAULT_EVENTS.includes(event) ? event : null;
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
  description: 'Configure webhook-based rich logging.',
  usage: 'logs <enable|disable|view|events|add|remove|color|ignore>',
  examples: [
    'logs enable',
    'logs disable',
    'logs add #mod-logs all',
    'logs add #message-logs messageDelete',
    'logs color messageDelete #ff3366',
    'logs events',
    'logs ignore add channel #spam'
  ],
  subcommands: [
    { name: 'enable', description: 'Enable logging.', usage: 'enable', examples: ['logs enable'] },
    { name: 'disable', description: 'Disable logging.', usage: 'disable', examples: ['logs disable'] },
    { name: 'view', description: 'View logging configuration.', usage: 'view', examples: ['logs view'] },
    { name: 'events', description: 'View all supported logging events.', usage: 'events', examples: ['logs events'] },
    { name: 'add', description: 'Set a log channel and create a webhook.', usage: 'add #channel <event|all>', examples: ['logs add #logs all'] },
    { name: 'remove', description: 'Remove a logging route.', usage: 'remove <event|#channel>', examples: ['logs remove all'] },
    { name: 'color', description: 'Set log embed color.', usage: 'color <event|all> <#hex>', examples: ['logs color all #5865f2'] },
    { name: 'ignore', description: 'Manage ignored channels/users/roles.', usage: 'ignore <list|add|remove>', examples: ['logs ignore list'] }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.ManageWebhooks, PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks],

  async execute({ message, args }) {
    const sub = (args.shift() || 'view').toLowerCase();

    if (sub === 'enable') {
      await updateGuildLogConfig(message.guild.id, (config) => {
        config.enabled = true;
      });

      return respond.reply(message, 'good', 'Logging is now enabled.');
    }

    if (sub === 'disable') {
      await updateGuildLogConfig(message.guild.id, (config) => {
        config.enabled = false;
      });

      return respond.reply(message, 'good', 'Logging is now disabled.');
    }

    if (sub === 'events') {
      return respond.reply(message, 'info', null, {
        title: 'Supported log events',
        description: DEFAULT_EVENTS.map((event) => `\`${event}\``).join(', ')
      });
    }

    if (sub === 'view') {
      const config = await getGuildLogConfig(message.guild.id);

      const channels = Object.entries(config.channels || {})
        .map(([event, id]) => `**${event}:** <#${id}>`)
        .join('\n') || 'No log channels configured.';

      const colors = Object.entries(config.colors || {})
        .map(([event, color]) => `**${event}:** ${color}`)
        .join('\n') || 'No custom colors.';

      const webhooks = Object.entries(config.webhooks || {})
        .map(([event, data]) => `**${event}:** webhook ${data.id || 'saved'}`)
        .join('\n') || 'No webhooks configured.';

      return respond.reply(message, 'info', null, {
        title: 'Logging configuration',
        fields: [
          { name: 'Enabled', value: config.enabled ? 'Yes' : 'No', inline: true },
          { name: 'Channels', value: channels.slice(0, 1024) },
          { name: 'Webhooks', value: webhooks.slice(0, 1024) },
          { name: 'Colors', value: colors.slice(0, 1024) }
        ]
      });
    }

    if (sub === 'add') {
      const id = channelId(args.shift());
      const eventType = normalizeEvent(args.shift() || 'all');

      if (!eventType) {
        return respond.reply(message, 'bad', 'Unknown log event. Use `logs events` to see supported events.');
      }

      const channel = id ? await message.guild.channels.fetch(id).catch(() => null) : null;

      if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) {
        return respond.reply(message, 'info', 'Usage: `logs add #channel <event|all>`.');
      }

      const webhook = await createLogWebhook(channel, message.author);

      await updateGuildLogConfig(message.guild.id, (config) => {
        config.enabled = true;
        config.channels[eventType] = channel.id;
        config.webhooks[eventType] = {
          id: webhook.id,
          token: webhook.token,
          url: webhook.url,
          channelId: channel.id
        };
      });

      return respond.reply(message, 'good', `Logging for **${eventType}** will go to ${channel} through a webhook.`);
    }

    if (sub === 'remove') {
      const target = args.shift();

      if (!target) return respond.reply(message, 'info', 'Usage: `logs remove <event|#channel>`.');

      await updateGuildLogConfig(message.guild.id, (config) => {
        const id = channelId(target);

        if (id) {
          for (const [event, savedId] of Object.entries(config.channels)) {
            if (savedId === id) {
              delete config.channels[event];
              delete config.webhooks[event];
            }
          }
        } else {
          delete config.channels[target];
          delete config.webhooks[target];
        }
      });

      return respond.reply(message, 'good', `Removed matching logging route(s) for **${target}**.`);
    }

    if (sub === 'color') {
      const eventType = normalizeEvent(args.shift());
      const color = parseColor(args.shift());

      if (!eventType || !color) return respond.reply(message, 'info', 'Usage: `logs color <event|all> <#hex>`.');

      await updateGuildLogConfig(message.guild.id, (config) => {
        config.colors[eventType] = color;
      });

      return respond.reply(message, 'good', `Set **${eventType}** log color to **${color}**.`);
    }

    if (sub === 'ignore') {
      const action = (args.shift() || 'list').toLowerCase();

      if (action === 'list') {
        const config = await getGuildLogConfig(message.guild.id);

        return respond.reply(message, 'info', null, {
          title: 'Logging ignore list',
          fields: [
            { name: 'Channels', value: config.ignores.channels.map((id) => `<#${id}>`).join(', ') || 'None' },
            { name: 'Users', value: config.ignores.users.map((id) => `<@${id}>`).join(', ') || 'None' },
            { name: 'Roles', value: config.ignores.roles.map((id) => `<@&${id}>`).join(', ') || 'None' }
          ]
        });
      }

      const type = (args.shift() || '').toLowerCase();
      const raw = args.shift();
      const id = type === 'channel' ? channelId(raw) : type === 'role' ? roleId(raw) : extractId(raw);

      if (!['add', 'remove'].includes(action) || !['channel', 'user', 'role'].includes(type) || !id) {
        return respond.reply(message, 'info', 'Usage: `logs ignore <add|remove> <channel|user|role> <id|mention>`.');
      }

      const key = `${type}s`;

      await updateGuildLogConfig(message.guild.id, (config) => {
        config.ignores[key] ||= [];

        if (action === 'add' && !config.ignores[key].includes(id)) {
          config.ignores[key].push(id);
        }

        if (action === 'remove') {
          config.ignores[key] = config.ignores[key].filter((x) => x !== id);
        }
      });

      return respond.reply(message, 'good', `${action === 'add' ? 'Added' : 'Removed'} **${id}** ${action === 'add' ? 'to' : 'from'} the ${type} ignore list.`);
    }

    return respond.reply(message, 'bad', `Unknown logs action: \`${sub}\`.`);
  }
};
