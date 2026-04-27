const { PermissionFlagsBits, ChannelType } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { updateProtectionConfig } = require('../../systems/security/protectionConfig');

const MODULES = new Set([
  'logging',
  'automod',
  'moderation',
  'welcome',
  'verification',
  'antiraid',
  'antinuke',
  'tickets',
  'roles',
  'levels',
  'suggestions',
  'starboard'
]);

const CHANNELS = {
  logging: 'rumi-logs',
  welcome: 'welcome',
  tickets: 'ticket-panel',
  suggestions: 'suggestions',
  starboard: 'starboard'
};

function normalizeModule(value) {
  const clean = String(value || '').toLowerCase().replace(/-/g, '');
  if (clean === 'antiraid') return 'antiraid';
  if (clean === 'antinuke') return 'antinuke';
  return clean;
}

async function ensureChannel(guild, name, actorTag) {
  let channel = guild.channels.cache.find((item) => item.name === name && item.type === ChannelType.GuildText);
  if (channel) return channel;

  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) return null;

  channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    reason: `Rumi setup by ${actorTag}`
  }).catch(() => null);

  return channel;
}

async function loadSettings(guildId) {
  const row = await db.getGuildSettings(guildId).catch(() => null);
  if (!row) return null;
  return { row, settings: row.settings_json || {} };
}

function removeModule(settings, module) {
  const removed = [];

  if (module === 'all') {
    for (const key of MODULES) {
      if (settings[key]) removed.push(key);
      delete settings[key];
    }
    return removed;
  }

  if (settings[module]) removed.push(module);
  delete settings[module];
  return removed;
}

module.exports = {
  name: 'setup',
  aliases: ['quicksetup'],
  category: 'config',
  guildOnly: true,
  description: 'Configure existing Rumi modules for this server.',
  usage: 'setup <module|all|remove> [module|all]',
  examples: ['setup logging', 'setup automod', 'setup all', 'setup remove logging', 'setup remove all'],
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.ManageChannels],
  typing: true,

  async execute({ message, args }) {
    const action = normalizeModule(args.shift() || 'view');
    const guild = message.guild;
    const loaded = await loadSettings(guild.id);

    if (!loaded) {
      return respond.reply(message, 'bad', 'I could not load setup settings because the database is currently unreachable.');
    }

    const { settings } = loaded;

    if (action === 'view') {
      const enabled = [...MODULES].filter((module) => settings[module]?.enabled || settings[module]);
      return respond.reply(
        message,
        'info',
        enabled.length ? `Configured modules: ${enabled.map((x) => `\`${x}\``).join(', ')}` : 'No setup modules are configured yet.'
      );
    }

    if (action === 'remove') {
      const target = normalizeModule(args.shift() || '');
      if (target !== 'all' && !MODULES.has(target)) {
        return respond.reply(message, 'info', 'Use `setup remove <module|all>`.');
      }

      const removed = removeModule(settings, target);
      const patch = { settings_json: settings };
      if (target === 'all' || target === 'automod') patch.automod_enabled = false;
      if (target === 'all' || target === 'tickets') patch.ticket_enabled = false;
      if (target === 'all') patch.lockdown_active = false;

      const saved = await db.updateGuildSettings(guild.id, patch).catch(() => null);
      if (!saved) {
        return respond.reply(message, 'bad', 'I could not remove setup settings because the database is currently unreachable.');
      }

      return respond.reply(
        message,
        'good',
        removed.length
          ? `I removed setup configuration for ${removed.map((x) => `\`${x}\``).join(', ')}. I did not delete channels or roles.`
          : 'There was no matching setup configuration to remove.'
      );
    }

    const module = action;
    if (module !== 'all' && !MODULES.has(module)) {
      return respond.reply(message, 'info', 'Choose a setup module: logging, automod, moderation, welcome, verification, antiraid, antinuke, tickets, roles, levels, suggestions, starboard, all, or remove.');
    }

    const targets = module === 'all' ? [...MODULES] : [module];
    const done = [];
    const patch = { settings_json: settings };
    const securityEnabled = settings.security?.enabled !== false;

    for (const target of targets) {
      if (target === 'logging') {
        const ch = await ensureChannel(guild, CHANNELS.logging, message.author.tag);
        settings.logging = { enabled: true, channelId: ch?.id || settings.logging?.channelId || null };
        done.push(`logging ${ch ? `<#${ch.id}>` : 'configured'}`);
      }

      if (target === 'automod') {
        settings.automod = { enabled: securityEnabled, mentions: 8, links: 4, spam: 4 };
        patch.automod_enabled = securityEnabled;
        done.push('automod defaults');
      }

      if (target === 'moderation') {
        settings.moderation = { enabled: true, cases: true, dmUsers: false };
        done.push('moderation defaults');
      }

      if (target === 'welcome') {
        const ch = await ensureChannel(guild, CHANNELS.welcome, message.author.tag);
        settings.welcome = {
          enabled: true,
          channelId: ch?.id || settings.welcome?.channelId || null,
          message: 'Welcome {user.mention} to {server.name}!'
        };
        done.push(`welcome ${ch ? `<#${ch.id}>` : 'configured'}`);
      }

      if (target === 'verification') {
        settings.verification = { enabled: true, method: 'button' };
        done.push('verification defaults');
      }

      if (target === 'antiraid') {
        settings.antiraid = {
          enabled: securityEnabled,
          action: 'alert',
          whitelist: [],
          verificationChannelId: settings.verification?.channelId || null,
          timeoutMinutes: 30
        };
        done.push('anti-raid defaults');
      }

      if (target === 'antinuke') {
        settings.antinuke = {
          enabled: securityEnabled,
          punishment: 'strip',
          whitelist: []
        };
        done.push('anti-nuke defaults');
      }

      if (target === 'tickets') {
        const ch = await ensureChannel(guild, CHANNELS.tickets, message.author.tag);
        settings.tickets = { enabled: true, panelChannelId: ch?.id || settings.tickets?.panelChannelId || null };
        done.push('ticket defaults');
      }

      if (target === 'roles') {
        settings.roles = settings.roles || { enabled: true, menus: [] };
        settings.roles.enabled = true;
        done.push('role defaults');
      }

      if (target === 'levels') {
        settings.levels = { enabled: true, multiplier: 1 };
        done.push('level defaults');
      }

      if (target === 'suggestions') {
        const ch = await ensureChannel(guild, CHANNELS.suggestions, message.author.tag);
        settings.suggestions = { enabled: true, channelId: ch?.id || settings.suggestions?.channelId || null };
        done.push(`suggestions ${ch ? `<#${ch.id}>` : 'configured'}`);
      }

      if (target === 'starboard') {
        const ch = await ensureChannel(guild, CHANNELS.starboard, message.author.tag);
        settings.starboard = { enabled: true, channelId: ch?.id || settings.starboard?.channelId || null, threshold: 3 };
        done.push(`starboard ${ch ? `<#${ch.id}>` : 'configured'}`);
      }
    }

    const saved = await db.updateGuildSettings(guild.id, patch).catch(() => null);
    if (!saved) {
      return respond.reply(message, 'bad', 'I could not save setup settings because the database is currently unreachable.');
    }

    if (targets.includes('antiraid') || targets.includes('antinuke') || module === 'all') {
      await updateProtectionConfig(guild.id, (current) => ({
        ...current,
        security: {
          ...(current.security || {}),
          enabled: securityEnabled
        },
        antiraid: settings.antiraid
          ? {
              ...(current.antiraid || {}),
              ...settings.antiraid
            }
          : current.antiraid,
        antinuke: settings.antinuke
          ? {
              ...(current.antinuke || {}),
              ...settings.antinuke
            }
          : current.antinuke
      })).catch(() => null);
    }

    return respond.reply(message, 'good', null, {
      description: `Setup complete.\nI configured: ${done.map((x) => `\`${x}\``).join(', ')}.`
    });
  }
};
