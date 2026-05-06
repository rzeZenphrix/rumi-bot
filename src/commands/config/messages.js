const { PermissionFlagsBits, ChannelType, EmbedBuilder } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const { findMember } = require('../../utils/memberResolver');
const { findRole } = require('../../utils/roleResolver');
const {
  getGuildMessagesConfig,
  updateGuildMessagesConfig,
  previewMessagesTemplate
} = require('../../systems/messages/guildMessages');

function trimText(value, max = 1500) {
  return String(value || '').trim().slice(0, max);
}

function parseToggle(value) {
  const normalized = String(value || '').toLowerCase();
  if (['on', 'enable', 'enabled', 'true', 'yes'].includes(normalized)) return true;
  if (['off', 'disable', 'disabled', 'false', 'no'].includes(normalized)) return false;
  return null;
}

function parseDelay(value) {
  if (!value) return null;
  const normalized = String(value).toLowerCase();
  if (['off', 'none', 'disable', 'disabled'].includes(normalized)) return 0;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(86400, Math.round(parsed));
}

async function findChannel(guild, input, fallbackChannel = null) {
  if (!input && fallbackChannel?.id) return fallbackChannel;
  const channelId = input?.match?.(/^<#(\d{17,20})>$/)?.[1] || extractId(input);
  if (!channelId) return null;
  return guild.channels.cache.get(channelId) || guild.channels.fetch(channelId).catch(() => null);
}

async function resolvePingTarget(guild, input) {
  const member = await findMember(guild, input);
  if (member) return `<@${member.id}>`;
  const role = await findRole(guild, input);
  if (role) return `<@&${role.id}>`;
  return null;
}

function buildPreviewEmbed(title, preview) {
  const lines = [];
  if (preview.content) lines.push(`**Message**\n${preview.content}`);
  if (preview.embedContent) lines.push(`**Embed**\n${preview.embedContent}`);
  return {
    title,
    description: lines.join('\n\n') || 'Nothing is configured yet.'
  };
}

function stickyLabel(entry) {
  return `\`${entry.id}\` in <#${entry.channelId}> every **${entry.interval} ${entry.mode === 'time' ? 'second(s)' : 'message(s)'}**`;
}

const subcommands = [
  ['welcome enable', 'messages welcome enable', 'Enable welcome messages.'],
  ['welcome disable', 'messages welcome disable', 'Disable welcome messages.'],
  ['welcome channel', 'messages welcome channel <#channel|channelId>', 'Set the welcome channel.'],
  ['welcome message', 'messages welcome message <text>', 'Set welcome text with variables.'],
  ['welcome embed', 'messages welcome embed <text>', 'Set welcome embed text with variables.'],
  ['welcome preview', 'messages welcome preview', 'Preview the resolved welcome output.'],
  ['welcome delete delay', 'messages welcome delete delay <seconds|off>', 'Delete welcome posts after a delay.'],
  ['leave enable', 'messages leave enable', 'Enable leave messages.'],
  ['leave disable', 'messages leave disable', 'Disable leave messages.'],
  ['leave channel', 'messages leave channel <#channel|channelId>', 'Set the leave channel.'],
  ['leave message', 'messages leave message <text>', 'Set leave text with variables.'],
  ['leave embed', 'messages leave embed <text>', 'Set leave embed text with variables.'],
  ['leave preview', 'messages leave preview', 'Preview the resolved leave output.'],
  ['leave delete delay', 'messages leave delete delay <seconds|off>', 'Delete leave posts after a delay.'],
  ['dm enable', 'messages dm enable', 'Enable join DMs.'],
  ['dm disable', 'messages dm disable', 'Disable join DMs.'],
  ['dm message', 'messages dm message <text>', 'Set the join DM text.'],
  ['dm embed', 'messages dm embed <text>', 'Set the join DM embed text.'],
  ['dm preview', 'messages dm preview', 'Preview the join DM output.'],
  ['ping enable', 'messages ping enable', 'Enable join ping messages.'],
  ['ping disable', 'messages ping disable', 'Disable join ping messages.'],
  ['ping add', 'messages ping add <@user|@role|id|name>', 'Add a join ping target.'],
  ['ping remove', 'messages ping remove <@user|@role|id|name>', 'Remove a join ping target.'],
  ['ping list', 'messages ping list', 'List join ping targets.'],
  ['ping delete delay', 'messages ping delete delay <seconds|off>', 'Delete join ping messages after a delay.'],
  ['sticky create', 'messages sticky create <text>', 'Create a sticky message in this channel.'],
  ['sticky delete', 'messages sticky delete <stickyId>', 'Delete a sticky message.'],
  ['sticky list', 'messages sticky list', 'List sticky messages.'],
  ['sticky edit', 'messages sticky edit <stickyId> <text>', 'Edit a sticky message.'],
  ['sticky interval', 'messages sticky interval <stickyId> <count|duration>', 'Set a sticky resend interval or message count.'],
  ['sticky preview', 'messages sticky preview <stickyId>', 'Preview a sticky output.'],
  ['system enable', 'messages system enable', 'Enable invoke/system messages.'],
  ['system disable', 'messages system disable', 'Disable invoke/system messages.'],
  ['system channel', 'messages system channel <#channel|channelId>', 'Set the default system output channel.'],
  ['system dm toggle', 'messages system dm toggle <on|off>', 'Toggle DM output for system events.'],
  ['system ban message', 'messages system ban message <text>', 'Set the ban system message.'],
  ['system kick message', 'messages system kick message <text>', 'Set the kick system message.'],
  ['system warn message', 'messages system warn message <text>', 'Set the warn system message.'],
  ['system timeout message', 'messages system timeout message <text>', 'Set the timeout system message.'],
  ['system role add message', 'messages system role add message <text>', 'Set the role add system message.'],
  ['system role remove message', 'messages system role remove message <text>', 'Set the role remove system message.'],
  ['system staff strip message', 'messages system staff strip message <text>', 'Set the staff strip system message.'],
  ['system role receive message', 'messages system role receive message <text>', 'Set the role receive system message.'],
  ['system role lost message', 'messages system role lost message <text>', 'Set the role lost system message.'],
  ['system preview', 'messages system preview <ban|kick|warn|timeout|roleadd|roleremove|staffstrip|rolereceive|rolelost>', 'Preview a system message payload.']
].map(([name, usage, description]) => ({
  name,
  usage,
  description,
  examples: [usage]
}));

const SYSTEM_TEMPLATE_MAP = {
  ban: 'ban',
  kick: 'kick',
  warn: 'warn',
  timeout: 'timeout',
  roleadd: 'roleAdd',
  'role-add': 'roleAdd',
  roleremove: 'roleRemove',
  'role-remove': 'roleRemove',
  staffstrip: 'staffStrip',
  'staff-strip': 'staffStrip',
  rolereceive: 'roleReceive',
  'role-receive': 'roleReceive',
  rolelost: 'roleLost',
  'role-lost': 'roleLost'
};

module.exports = {
  name: 'messages',
  aliases: ['msgcfg', 'guildmessages'],
  category: 'config',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  description: 'Configure welcome, leave, join DM, ping, sticky, and invoke messages.',
  usage: 'messages <welcome|leave|dm|ping|sticky|system> ...',
  examples: ['messages welcome enable', 'messages sticky create Read the rules before chatting.', 'messages system ban message {user.mention} was banned for {punishment.reason}'],
  subcommands,
  typing: true,

  async execute({ message, args }) {
    const area = String(args.shift() || '').toLowerCase();
    if (!area) {
      return respond.reply(message, 'info', 'Use `messages <welcome|leave|dm|ping|sticky|system> ...`.');
    }

    const config = await getGuildMessagesConfig(message.guild.id);

    if (area === 'welcome' || area === 'leave') {
      const branch = config[area];
      const action = String(args.shift() || 'preview').toLowerCase();

      if (action === 'enable' || action === 'disable') {
        const next = await updateGuildMessagesConfig(message.guild.id, (current) => {
          current[area].enabled = action === 'enable';
          return current;
        });
        return respond.reply(message, 'good', `${area === 'welcome' ? 'Welcome' : 'Leave'} messages are now **${next[area].enabled ? 'enabled' : 'disabled'}**.`);
      }

      if (action === 'channel') {
        const channel = await findChannel(message.guild, args[0], message.channel);
        if (!channel?.isTextBased?.()) {
          return respond.reply(message, 'info', `Use \`messages ${area} channel <#channel|channelId>\`.`);
        }
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current[area].channelId = channel.id;
          return current;
        });
        return respond.reply(message, 'good', `${area === 'welcome' ? 'Welcome' : 'Leave'} channel set to ${channel}.`);
      }

      if (action === 'message' || action === 'embed') {
        const text = trimText(args.join(' '), 1500);
        if (!text) return respond.reply(message, 'info', `Use \`messages ${area} ${action} <text>\`.`);
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current[area][action] = text;
          return current;
        });
        return respond.reply(message, 'good', `Saved the ${area} ${action} template.`);
      }

      if (action === 'delete' && String(args[0] || '').toLowerCase() === 'delay') {
        const delay = parseDelay(args[1]);
        if (delay === null) return respond.reply(message, 'info', `Use \`messages ${area} delete delay <seconds|off>\`.`);
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current[area].deleteDelaySeconds = delay;
          return current;
        });
        return respond.reply(message, 'good', `${area} delete delay is now **${delay ? `${delay}s` : 'off'}**.`);
      }

      if (action === 'preview') {
        const preview = await previewMessagesTemplate(message, branch.message, branch.embed);
        return respond.reply(message, 'info', null, buildPreviewEmbed(`${area[0].toUpperCase()}${area.slice(1)} preview`, preview));
      }

      return respond.reply(message, 'info', `Use \`messages ${area} <enable|disable|channel|message|embed|preview|delete delay>\`.`);
    }

    if (area === 'dm') {
      const action = String(args.shift() || 'preview').toLowerCase();
      if (action === 'enable' || action === 'disable') {
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.dm.enabled = action === 'enable';
          return current;
        });
        return respond.reply(message, 'good', `Join DMs are now **${action === 'enable' ? 'enabled' : 'disabled'}**.`);
      }
      if (action === 'message' || action === 'embed') {
        const text = trimText(args.join(' '), 1500);
        if (!text) return respond.reply(message, 'info', `Use \`messages dm ${action} <text>\`.`);
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.dm[action] = text;
          return current;
        });
        return respond.reply(message, 'good', `Saved the join DM ${action} template.`);
      }
      if (action === 'preview') {
        const preview = await previewMessagesTemplate(message, config.dm.message, config.dm.embed);
        return respond.reply(message, 'info', null, buildPreviewEmbed('Join DM preview', preview));
      }
      return respond.reply(message, 'info', 'Use `messages dm <enable|disable|message|embed|preview>`.');
    }

    if (area === 'ping') {
      const action = String(args.shift() || 'list').toLowerCase();
      if (action === 'enable' || action === 'disable') {
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.ping.enabled = action === 'enable';
          return current;
        });
        return respond.reply(message, 'good', `Join ping messages are now **${action === 'enable' ? 'enabled' : 'disabled'}**.`);
      }
      if (action === 'list') {
        return respond.reply(message, 'info', null, {
          description: config.ping.targets.length
            ? `**Join ping targets**\n${config.ping.targets.map((entry, index) => `${index + 1}. ${entry}`).join('\n')}\n\nDelete delay: **${config.ping.deleteDelaySeconds || 0}s**`
            : 'No join ping targets are configured yet.'
        });
      }
      if (action === 'add' || action === 'remove') {
        const target = await resolvePingTarget(message.guild, args.join(' '));
        if (!target) return respond.reply(message, 'info', `Use \`messages ping ${action} <@user|@role|id|name>\`.`);
        const next = await updateGuildMessagesConfig(message.guild.id, (current) => {
          const set = new Set(current.ping.targets || []);
          if (action === 'add') set.add(target);
          else set.delete(target);
          current.ping.targets = [...set];
          return current;
        });
        return respond.reply(message, 'good', `${action === 'add' ? 'Added' : 'Removed'} ${target}. Total targets: **${next.ping.targets.length}**.`);
      }
      if (action === 'delete' && String(args[0] || '').toLowerCase() === 'delay') {
        const delay = parseDelay(args[1]);
        if (delay === null) return respond.reply(message, 'info', 'Use `messages ping delete delay <seconds|off>`.');
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.ping.deleteDelaySeconds = delay;
          return current;
        });
        return respond.reply(message, 'good', `Join ping delete delay is now **${delay ? `${delay}s` : 'off'}**.`);
      }
      return respond.reply(message, 'info', 'Use `messages ping <enable|disable|add|remove|list|delete delay>`.');
    }

    if (area === 'sticky') {
      const action = String(args.shift() || 'list').toLowerCase();
      if (action === 'list') {
        return respond.reply(message, 'info', null, {
          description: config.sticky.length
            ? `**Sticky messages**\n${config.sticky.map((entry, index) => `${index + 1}. ${stickyLabel(entry)}`).join('\n')}`
            : 'No sticky messages are configured yet.'
        });
      }
      if (action === 'create') {
        const text = trimText(args.join(' '), 1500);
        if (!text) return respond.reply(message, 'info', 'Use `messages sticky create <text>`.');
        const stickyId = `sticky_${Date.now().toString(36)}`;
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.sticky.push({
            id: stickyId,
            channelId: message.channel.id,
            message: text,
            embed: '',
            mode: 'messages',
            interval: 5,
            createdBy: message.author.id
          });
          return current;
        });
        return respond.reply(message, 'good', `Created sticky message \`${stickyId}\` for ${message.channel}.`);
      }
      const stickyId = String(args.shift() || '').trim();
      const sticky = config.sticky.find((entry) => entry.id === stickyId);
      if (!sticky) return respond.reply(message, 'bad', 'I could not find that sticky message.');

      if (action === 'delete') {
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.sticky = current.sticky.filter((entry) => entry.id !== stickyId);
          return current;
        });
        return respond.reply(message, 'good', `Deleted sticky message \`${stickyId}\`.`);
      }
      if (action === 'edit') {
        const text = trimText(args.join(' '), 1500);
        if (!text) return respond.reply(message, 'info', 'Use `messages sticky edit <stickyId> <text>`.');
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          const target = current.sticky.find((entry) => entry.id === stickyId);
          if (target) target.message = text;
          return current;
        });
        return respond.reply(message, 'good', `Updated sticky message \`${stickyId}\`.`);
      }
      if (action === 'interval') {
        const raw = String(args.join(' ') || '').trim().toLowerCase();
        if (!raw) return respond.reply(message, 'info', 'Use `messages sticky interval <stickyId> <count|duration>`.');
        let mode = 'messages';
        let interval = Number(raw);
        if (!Number.isFinite(interval)) {
          const match = raw.match(/^(\d+)\s*(s|sec|secs|second|seconds|m|min|mins|minute|minutes)$/);
          if (!match) return respond.reply(message, 'bad', 'Use a plain number for message count or a duration like `30s` or `5m`.');
          const count = Number(match[1]);
          const unit = match[2];
          mode = 'time';
          interval = unit.startsWith('m') ? count * 60 : count;
        }
        if (!Number.isFinite(interval) || interval <= 0) return respond.reply(message, 'bad', 'That interval has to be greater than zero.');
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          const target = current.sticky.find((entry) => entry.id === stickyId);
          if (target) {
            target.mode = mode;
            target.interval = Math.round(interval);
          }
          return current;
        });
        return respond.reply(message, 'good', `Sticky \`${stickyId}\` now posts every **${Math.round(interval)} ${mode === 'time' ? 'second(s)' : 'message(s)'}**.`);
      }
      if (action === 'preview') {
        const preview = await previewMessagesTemplate(message, sticky.message, sticky.embed);
        return respond.reply(message, 'info', null, buildPreviewEmbed(`Sticky preview - ${stickyId}`, preview));
      }
      return respond.reply(message, 'info', 'Use `messages sticky <create|delete|list|edit|interval|preview>`.');
    }

    if (area === 'system') {
      const action = String(args.shift() || '').toLowerCase();
      if (action === 'enable' || action === 'disable') {
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.system.enabled = action === 'enable';
          return current;
        });
        return respond.reply(message, 'good', `Invoke/system messages are now **${action === 'enable' ? 'enabled' : 'disabled'}**.`);
      }
      if (action === 'channel') {
        const channel = await findChannel(message.guild, args[0], message.channel);
        if (!channel?.isTextBased?.()) return respond.reply(message, 'info', 'Use `messages system channel <#channel|channelId>`.');
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.system.channelId = channel.id;
          return current;
        });
        return respond.reply(message, 'good', `System message channel set to ${channel}.`);
      }
      if (action === 'dm' && String(args[0] || '').toLowerCase() === 'toggle') {
        const enabled = parseToggle(args[1]);
        if (enabled === null) return respond.reply(message, 'info', 'Use `messages system dm toggle <on|off>`.');
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.system.dmToggle = enabled;
          return current;
        });
        return respond.reply(message, 'good', `System DMs are now **${enabled ? 'enabled' : 'disabled'}**.`);
      }
      if (action === 'preview') {
        const key = SYSTEM_TEMPLATE_MAP[String(args[0] || '').toLowerCase()];
        if (!key) return respond.reply(message, 'info', 'Use `messages system preview <ban|kick|warn|timeout|roleadd|roleremove|staffstrip|rolereceive|rolelost>`.');
        const preview = await previewMessagesTemplate(message, config.system.templates[key], '');
        return respond.reply(message, 'info', null, buildPreviewEmbed(`System preview - ${key}`, preview));
      }

      if (action === 'role') {
        const verb = String(args.shift() || '').toLowerCase();
        const messageWord = String(args.shift() || '').toLowerCase();
        const templateKey = SYSTEM_TEMPLATE_MAP[`role${verb}`];
        if (!templateKey || messageWord !== 'message') {
          return respond.reply(message, 'info', 'Use `messages system role <add|remove|receive|lost> message <text>`.');
        }
        const text = trimText(args.join(' '), 1500);
        if (!text) return respond.reply(message, 'info', `Use \`messages system role ${verb} message <text>\`.`);
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.system.templates[templateKey] = text;
          return current;
        });
        return respond.reply(message, 'good', `Saved the role ${verb} system message template.`);
      }

      if (action === 'staff') {
        const qualifier = String(args.shift() || '').toLowerCase();
        const messageWord = String(args.shift() || '').toLowerCase();
        if (qualifier !== 'strip' || messageWord !== 'message') {
          return respond.reply(message, 'info', 'Use `messages system staff strip message <text>`.');
        }
        const text = trimText(args.join(' '), 1500);
        if (!text) return respond.reply(message, 'info', 'Use `messages system staff strip message <text>`.');
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.system.templates.staffStrip = text;
          return current;
        });
        return respond.reply(message, 'good', 'Saved the staff strip system message template.');
      }

      const subject = action;
      const messageWord = String(args.shift() || '').toLowerCase();
      const templateKey = SYSTEM_TEMPLATE_MAP[subject];
      if (templateKey && messageWord === 'message') {
        const text = trimText(args.join(' '), 1500);
        if (!text) return respond.reply(message, 'info', `Use \`messages system ${subject} message <text>\`.`);
        await updateGuildMessagesConfig(message.guild.id, (current) => {
          current.system.templates[templateKey] = text;
          return current;
        });
        return respond.reply(message, 'good', `Saved the ${subject} system message template.`);
      }

      return respond.reply(message, 'info', 'Use `messages system <enable|disable|channel|dm toggle|ban message|kick message|warn message|timeout message|role add message|role remove message|staff strip message|role receive message|role lost message|preview>`.');
    }

    return respond.reply(message, 'info', 'Use `messages <welcome|leave|dm|ping|sticky|system> ...`.');
  }
};
