const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  getProtectionSettings,
  updateProtectionSection,
  enableSecuritySystem
} = require('../../systems/security/protectionConfig');
const {
  ACTIONS,
  PUNISHMENT_TYPES,
  ROLLBACK_MODES,
  normalizeActionId,
  normalizePunishments,
  normalizeRollbackMode
} = require('../../systems/antinuke/actionTypes');
const { DEFAULT_ANTINUKE, normalizeAntinukeConfig } = require('../../systems/antinuke/config');
const { listIncidents, getIncident, shortId } = require('../../systems/antinuke/incidentStore');
const { isBotOwner } = require('../../systems/owner/ownerManager');

function extractId(value = '') {
  return String(value || '').match(/\d{15,25}/)?.[0] || null;
}

async function resolveMember(message, value) {
  const mention = message.mentions.members.first();
  if (mention) return mention;

  const id = extractId(value);
  if (id) return message.guild.members.fetch(id).catch(() => null);

  const query = String(value || '').toLowerCase();
  return message.guild.members.cache.find((member) =>
    member.user.username.toLowerCase() === query ||
    member.displayName.toLowerCase() === query ||
    member.user.username.toLowerCase().includes(query) ||
    member.displayName.toLowerCase().includes(query)
  ) || null;
}

function resolveRole(message, value) {
  const mention = message.mentions.roles.first();
  if (mention) return mention;

  const id = extractId(value);
  if (id) return message.guild.roles.cache.get(id) || null;

  const query = String(value || '').toLowerCase();
  return message.guild.roles.cache.find((role) =>
    role.name.toLowerCase() === query ||
    role.name.toLowerCase().includes(query)
  ) || null;
}

async function canManageAntinuke(message, config, ownerOnly = false) {
  if (isBotOwner(message.author.id)) return true;
  if (message.guild.ownerId === message.author.id) return true;
  if (ownerOnly) return false;

  if (config.admins?.includes(message.author.id)) return true;

  return false;
}

function formatPunishments(list = []) {
  return list.length ? list.map((item) => `\`${item}\``).join(' → ') : '`none`';
}

function formatStatus(config) {
  const enabledActions = Object.entries(config.actions || {})
    .filter(([, value]) => value.enabled)
    .length;

  return [
    `Enabled: **${config.enabled ? 'Yes' : 'No'}**`,
    `Preset: **${config.preset || 'custom'}**`,
    `Default punishments: ${formatPunishments(config.defaultPunishments)}`,
    `Rollback: **${config.rollback?.enabled ? config.rollback.mode : 'off'}**`,
    `Actions enabled: **${enabledActions}/${Object.keys(ACTIONS).length}**`,
    `Anti-nuke admins: **${config.admins?.length || 0}**`,
    `Trusted users: **${config.trustedUsers?.length || 0}**`,
    `Trusted roles: **${config.trustedRoles?.length || 0}**`,
    `Trusted bots: **${config.trustedBots?.length || 0}**`
  ].join('\n');
}

function formatActions(config) {
  return Object.entries(ACTIONS)
    .map(([id, action]) => {
      const cfg = config.actions[id];
      return `• \`${id.replaceAll('_', '-')}\` — ${cfg.enabled ? 'on' : 'off'} — ${cfg.limit}/${cfg.windowSeconds}s — weight ${cfg.weight} — rollback ${cfg.rollback}`;
    })
    .join('\n')
    .slice(0, 4000);
}

function listIds(ids = [], type = 'user') {
  if (!ids.length) return 'None';

  return ids.map((id) => {
    if (type === 'role') return `<@&${id}>`;
    return `<@${id}>`;
  }).join(', ');
}

async function saveAntinuke(message, updater) {
  const saved = await updateProtectionSection(message.guild.id, 'antinuke', (current) => {
    const currentNormalized = normalizeAntinukeConfig(current || {});
    const next = typeof updater === 'function' ? updater(currentNormalized) : updater;
    return normalizeAntinukeConfig(next);
  }).catch(() => null);

  return saved ? normalizeAntinukeConfig(saved) : null;
}


function parseDurationMs(value) {
  const text = String(value || '').trim().toLowerCase();
  const match = text.match(/^(\d+)(ms|s|m|h|d)?$/);
  if (!match) return null;

  const amount = Number(match[1]);
  const unit = match[2] || 'm';

  if (!Number.isFinite(amount) || amount <= 0) return null;

  const multipliers = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 60 * 60_000,
    d: 24 * 60 * 60_000
  };

  return amount * multipliers[unit];
}

function formatMs(ms) {
  const value = Number(ms || 0);

  if (value >= 24 * 60 * 60_000) return `${Math.round(value / (24 * 60 * 60_000))}d`;
  if (value >= 60 * 60_000) return `${Math.round(value / (60 * 60_000))}h`;
  if (value >= 60_000) return `${Math.round(value / 60_000)}m`;
  return `${Math.round(value / 1000)}s`;
}

function presetConfig(name) {
  const preset = String(name || '').toLowerCase();

  const base = normalizeAntinukeConfig(DEFAULT_ANTINUKE);

  if (preset === 'low') {
    for (const action of Object.values(base.actions)) {
      action.limit = Math.ceil(action.limit * 1.8);
      action.windowSeconds = Math.max(action.windowSeconds, 45);
      action.weight = Math.max(1, Math.floor(action.weight * 0.75));
    }

    base.preset = 'low';
    base.defaultPunishments = ['alert'];
    base.rollback = { enabled: false, mode: 'off' };
    base.combinedScore.limit = 35;

    return base;
  }

  if (preset === 'normal') {
    const normal = normalizeAntinukeConfig(DEFAULT_ANTINUKE);
    normal.preset = 'normal';
    return normal;
  }

  if (preset === 'strict') {
    for (const action of Object.values(base.actions)) {
      action.limit = Math.max(1, Math.floor(action.limit * 0.7));
      action.windowSeconds = Math.max(10, Math.floor(action.windowSeconds * 0.8));
      action.weight = Math.ceil(action.weight * 1.15);
    }

    base.preset = 'strict';
    base.defaultPunishments = ['staff_strip', 'strip', 'timeout'];
    base.rollback = { enabled: true, mode: 'standard' };
    base.combinedScore.limit = 15;

    return base;
  }

  if (preset === 'paranoid') {
    for (const action of Object.values(base.actions)) {
      action.enabled = true;
      action.limit = Math.max(1, Math.floor(action.limit * 0.45));
      action.windowSeconds = Math.max(10, Math.floor(action.windowSeconds * 0.7));
      action.weight = Math.ceil(action.weight * 1.4);
    }

    base.preset = 'paranoid';
    base.defaultPunishments = ['staff_strip', 'strip', 'timeout', 'lockdown'];
    base.rollback = { enabled: true, mode: 'aggressive' };
    base.combinedScore.limit = 10;

    return base;
  }

  return null;
}

function botHealthCheck(guild) {
  const me = guild.members.me;
  const missing = [];

  const required = [
    ['ViewAuditLog', PermissionFlagsBits.ViewAuditLog],
    ['ManageRoles', PermissionFlagsBits.ManageRoles],
    ['ManageChannels', PermissionFlagsBits.ManageChannels],
    ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
    ['BanMembers', PermissionFlagsBits.BanMembers],
    ['KickMembers', PermissionFlagsBits.KickMembers],
    ['ModerateMembers', PermissionFlagsBits.ModerateMembers],
    ['ManageGuild', PermissionFlagsBits.ManageGuild],
    ['ManageGuildExpressions', PermissionFlagsBits.ManageGuildExpressions],
    ['SendMessages', PermissionFlagsBits.SendMessages],
    ['EmbedLinks', PermissionFlagsBits.EmbedLinks]
  ];

  for (const [name, bit] of required) {
    if (!me.permissions.has(bit)) missing.push(name);
  }

  return {
    missing,
    highestRole: me.roles.highest,
    ok: missing.length === 0
  };
}

module.exports = {
  name: 'antinuke',
  aliases: ['an'],
  category: 'security',
  description: 'Anti-nuke protection with thresholds, trust controls, rollbacks, incidents, and multiple punishments.',
  usage: [
    'antinuke status',
    'antinuke enable',
    'antinuke disable',
    'antinuke actions',
    'antinuke threshold action count seconds',
    'antinuke punishment set punishment',
    'antinuke rollback mode',
    'antinuke admin add @user',
    'antinuke trust user add @user',
    'antinuke trust role add @role',
    'antinuke trust bot add @bot',
    'antinuke logchannel #channel',
    'antinuke incidents'
  ],
  examples: [
    'antinuke enable',
    'antinuke threshold channel-delete 3 20',
    'antinuke punishment set staff_strip strip timeout',
    'antinuke rollback standard',
    'antinuke trust role add @Trusted Admin',
    'antinuke incidents'
  ],
  subcommands: [
    { name: 'status', description: 'Show anti-nuke configuration and health.', usage: ['antinuke status'], examples: ['antinuke status'] },
    { name: 'enable', aliases: ['on'], description: 'Enable anti-nuke and global security.', usage: ['antinuke enable'], examples: ['antinuke enable'] },
    { name: 'disable', aliases: ['off'], description: 'Disable anti-nuke. Server owner only.', usage: ['antinuke disable'], examples: ['antinuke disable'] },
    { name: 'actions', description: 'List all anti-nuke action protections.', usage: ['antinuke actions'], examples: ['antinuke actions'] },
    { name: 'action', description: 'Enable or disable a specific anti-nuke action.', usage: ['antinuke action enable action', 'antinuke action disable action'], examples: ['antinuke action enable channel-delete'] },
    { name: 'threshold', description: 'Customize action threshold count and window.', usage: ['antinuke threshold action count seconds'], examples: ['antinuke threshold channel-delete 3 20'] },
    { name: 'punishment', description: 'Set default or per-action punishments.', usage: ['antinuke punishment set punishment', 'antinuke punishment action action punishment'], examples: ['antinuke punishment set staff_strip strip timeout'] },
    { name: 'rollback', description: 'Set rollback mode globally or per action.', usage: ['antinuke rollback mode', 'antinuke rollback action action mode'], examples: ['antinuke rollback standard'] },
    { name: 'admin', aliases: ['am'], description: 'Manage anti-nuke admins. Server owner only.', usage: ['antinuke admin add @user', 'antinuke admin remove @user', 'antinuke admin list'], examples: ['antinuke admin add @SecurityLead'] },
    { name: 'trust', description: 'Manage trusted users, roles, and bots.', usage: ['antinuke trust user add @user', 'antinuke trust role add @role', 'antinuke trust bot add @bot'], examples: ['antinuke trust role add @Trusted Admin'] },
    { name: 'logchannel', description: 'Set anti-nuke log channel.', usage: ['antinuke logchannel #channel', 'antinuke logchannel clear'], examples: ['antinuke logchannel #security-logs'] },
    { name: 'incidents', description: 'List recent anti-nuke incidents.', usage: ['antinuke incidents'], examples: ['antinuke incidents'] },
    { name: 'incident', description: 'View one anti-nuke incident.', usage: ['antinuke incident id'], examples: ['antinuke incident 1234abcd'] },
    { name: 'reset', description: 'Reset anti-nuke config. Server owner only.', usage: ['antinuke reset'], examples: ['antinuke reset'] },
    {
      name: 'check',
      aliases: ['health'],
      description: 'Check whether Rumi has the permissions and hierarchy needed for anti-nuke.',
      usage: ['antinuke check'],
      examples: ['antinuke check']
    },
    {
      name: 'preset',
      description: 'Apply an anti-nuke preset.',
      usage: ['antinuke preset low', 'antinuke preset normal', 'antinuke preset strict', 'antinuke preset paranoid'],
      examples: ['antinuke preset strict']
    },
    {
      name: 'combined',
      description: 'Set or view combined anti-nuke score detection.',
      usage: ['antinuke combined', 'antinuke combined count seconds', 'antinuke combined off'],
      examples: ['antinuke combined 20 30']
    },
    {
      name: 'timeout',
      description: 'Set normal and severe anti-nuke timeout durations.',
      usage: ['antinuke timeout normal duration', 'antinuke timeout severe duration'],
      examples: ['antinuke timeout normal 12h', 'antinuke timeout severe 7d']
    },
    {
      name: 'alertrole',
      description: 'Set or clear the anti-nuke alert role.',
      usage: ['antinuke alertrole @role', 'antinuke alertrole clear'],
      examples: ['antinuke alertrole @Security']
    },
    {
      name: 'ownerdm',
      description: 'Enable or disable owner DMs for severe anti-nuke incidents.',
      usage: ['antinuke ownerdm on', 'antinuke ownerdm off'],
      examples: ['antinuke ownerdm on']
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const protection = await getProtectionSettings(message.guild.id).catch(() => null);

    if (!protection) {
      return respond.reply(message, 'bad', 'I could not load anti-nuke settings because the database is currently unreachable.');
    }

    const config = normalizeAntinukeConfig(protection.antinuke || {});
    const sub = String(args.shift() || 'status').toLowerCase();

    if (!(await canManageAntinuke(message, config, ['disable', 'reset'].includes(sub)))) {
      return respond.reply(message, 'bad', 'Only the server owner or configured anti-nuke admins can manage this system.');
    }

    if (sub === 'status') {
      return respond.reply(message, 'info', null, {
        title: 'Anti-Nuke Status',
        description: formatStatus(config),
        fields: [
          {
            name: 'Combined score',
            value: config.combinedScore?.enabled
              ? `${config.combinedScore.limit} score / ${config.combinedScore.windowSeconds}s`
              : 'Disabled',
            inline: false
          },
          {
            name: 'Default punishment chain',
            value: formatPunishments(config.defaultPunishments),
            inline: false
          }
        ],
        mentionUser: false
      });
    }

    if (sub === 'enable' || sub === 'on') {
      const saved = await enableSecuritySystem(message.guild.id, 'antinuke').catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not enable anti-nuke.');
      }

      return respond.reply(message, 'good', 'Anti-nuke is now enabled.');
    }

    if (sub === 'disable' || sub === 'off') {
      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        enabled: false
      }));

      if (!saved) return respond.reply(message, 'bad', 'I could not disable anti-nuke.');

      return respond.reply(message, 'good', 'Anti-nuke is now disabled.');
    }

    if (sub === 'actions') {
      return respond.reply(message, 'info', null, {
        title: 'Anti-Nuke Actions',
        description: formatActions(config),
        mentionUser: false
      });
    }

    if (sub === 'action') {
      const mode = String(args.shift() || '').toLowerCase();
      const actionId = normalizeActionId(args.shift());

      if (!['enable', 'disable', 'on', 'off'].includes(mode) || !actionId) {
        return respond.reply(message, 'info', 'Use `antinuke action <enable|disable> <action>`.');
      }

      const enabled = mode === 'enable' || mode === 'on';

      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        actions: {
          ...current.actions,
          [actionId]: {
            ...current.actions[actionId],
            enabled
          }
        }
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-nuke action \`${actionId}\` is now **${enabled ? 'enabled' : 'disabled'}**.`
        : 'I could not save that action setting.');
    }

    if (sub === 'threshold') {
      const actionId = normalizeActionId(args.shift());
      const limit = Number(args.shift());
      const seconds = Number(args.shift());

      if (!actionId || !Number.isFinite(limit) || !Number.isFinite(seconds)) {
        return respond.reply(message, 'info', 'Use `antinuke threshold <action> <count> <seconds>`.');
      }

      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        preset: 'custom',
        actions: {
          ...current.actions,
          [actionId]: {
            ...current.actions[actionId],
            limit,
            windowSeconds: seconds
          }
        }
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Threshold for \`${actionId}\` set to **${limit}/${seconds}s**.`
        : 'I could not save that threshold.');
    }

    if (sub === 'punishment') {
      const mode = String(args.shift() || 'set').toLowerCase();

      if (mode === 'set') {
        const punishments = normalizePunishments(args);

        if (!punishments.length) {
          return respond.reply(message, 'info', `Valid punishments: ${PUNISHMENT_TYPES.map((item) => `\`${item}\``).join(', ')}`);
        }

        const saved = await saveAntinuke(message, (current) => ({
          ...current,
          defaultPunishments: punishments
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Default punishment chain set to ${formatPunishments(punishments)}.`
          : 'I could not save punishment settings.');
      }

      if (mode === 'action') {
        const actionId = normalizeActionId(args.shift());
        const punishments = normalizePunishments(args);

        if (!actionId || !punishments.length) {
          return respond.reply(message, 'info', 'Use `antinuke punishment action <action> <punishment...>`.');
        }

        const saved = await saveAntinuke(message, (current) => ({
          ...current,
          actions: {
            ...current.actions,
            [actionId]: {
              ...current.actions[actionId],
              punishments
            }
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Punishment chain for \`${actionId}\` set to ${formatPunishments(punishments)}.`
          : 'I could not save action punishment settings.');
      }

      return respond.reply(message, 'info', 'Use `antinuke punishment set <punishment...>` or `antinuke punishment action <action> <punishment...>`.');
    }

    if (sub === 'rollback') {
      const mode = String(args.shift() || '').toLowerCase();

      if (mode === 'action') {
        const actionId = normalizeActionId(args.shift());
        const rollback = normalizeRollbackMode(args.shift());

        if (!actionId || !rollback) {
          return respond.reply(message, 'info', `Use \`antinuke rollback action <action> <${ROLLBACK_MODES.join('|')}>\`.`);
        }

        const saved = await saveAntinuke(message, (current) => ({
          ...current,
          actions: {
            ...current.actions,
            [actionId]: {
              ...current.actions[actionId],
              rollback
            }
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Rollback for \`${actionId}\` set to **${rollback}**.`
          : 'I could not save rollback settings.');
      }

      const rollback = normalizeRollbackMode(mode);

      if (!rollback) {
        return respond.reply(message, 'info', `Valid rollback modes: ${ROLLBACK_MODES.map((item) => `\`${item}\``).join(', ')}`);
      }

      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        rollback: {
          ...current.rollback,
          enabled: rollback !== 'off',
          mode: rollback
        }
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Global rollback mode set to **${rollback}**.`
        : 'I could not save rollback mode.');
    }

    if (sub === 'admin') {
      if (message.guild.ownerId !== message.author.id && !isBotOwner(message.author.id)) {
        return respond.reply(message, 'bad', 'Only the server owner can manage anti-nuke admins.');
      }

      const mode = String(args.shift() || 'list').toLowerCase();

      if (mode === 'list') {
        return respond.reply(message, 'info', `Anti-nuke admins: ${listIds(config.admins)}`);
      }

      const member = await resolveMember(message, args.join(' '));
      if (!member) return respond.reply(message, 'info', 'Use `antinuke admin <add|remove> @user`.');

      const admins = new Set(config.admins || []);

      if (mode === 'add') admins.add(member.id);
      else if (mode === 'remove' || mode === 'delete') admins.delete(member.id);
      else return respond.reply(message, 'info', 'Use `antinuke admin <add|remove|list> @user`.');

      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        admins: [...admins]
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Updated anti-nuke admins: ${listIds([...admins])}`
        : 'I could not update anti-nuke admins.');
    }

    if (sub === 'trust' || sub === 'trusted') {
      const type = String(args.shift() || '').toLowerCase();
      const mode = String(args.shift() || 'list').toLowerCase();

      if (!['user', 'role', 'bot'].includes(type)) {
        return respond.reply(message, 'info', 'Use `antinuke trust <user|role|bot> <add|remove|list> <target>`.');
      }

      const key = type === 'user'
        ? 'trustedUsers'
        : type === 'role'
          ? 'trustedRoles'
          : 'trustedBots';

      if (mode === 'list') {
        return respond.reply(message, 'info', `${type} trust list: ${listIds(config[key], type === 'role' ? 'role' : 'user')}`);
      }

      let id = null;

      if (type === 'role') {
        const role = resolveRole(message, args.join(' '));
        id = role?.id;
      } else {
        const member = await resolveMember(message, args.join(' '));
        id = member?.id;
      }

      if (!id) return respond.reply(message, 'info', 'I could not resolve that trust target.');

      const values = new Set(config[key] || []);

      if (mode === 'add') values.add(id);
      else if (mode === 'remove' || mode === 'delete') values.delete(id);
      else return respond.reply(message, 'info', 'Use `antinuke trust <user|role|bot> <add|remove|list> <target>`.');

      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        [key]: [...values]
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Updated ${type} trust list.`
        : 'I could not update trust settings.');
    }

    if (sub === 'logchannel') {
      const token = args.shift();

      if (!token || token.toLowerCase() === 'clear') {
        const saved = await saveAntinuke(message, (current) => ({
          ...current,
          logChannelId: null
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved ? 'Anti-nuke log channel cleared.' : 'I could not update log channel.');
      }

      const channelId = extractId(token);
      const channel = channelId ? message.guild.channels.cache.get(channelId) : message.mentions.channels.first();

      if (!channel) {
        return respond.reply(message, 'info', 'Use `antinuke logchannel #channel` or `antinuke logchannel clear`.');
      }

      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        logChannelId: channel.id
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved ? `Anti-nuke log channel set to ${channel}.` : 'I could not update log channel.');
    }

    if (sub === 'incidents') {
      const incidents = await listIncidents(message.guild.id, 10);

      return respond.reply(message, 'info', null, {
        title: 'Recent Anti-Nuke Incidents',
        description: incidents.length
          ? incidents.map((incident) => {
              const id = shortId(incident.id);
              return `• \`${id}\` — **${incident.status}** — ${incident.executor_id ? `<@${incident.executor_id}>` : 'Unknown'} — ${incident.action_types?.join(', ') || 'unknown'}`;
            }).join('\n').slice(0, 4000)
          : 'No incidents found.',
        mentionUser: false
      });
    }

    if (sub === 'incident') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', 'Use `antinuke incident <id>`.');

      const incidents = await listIncidents(message.guild.id, 50);
      const incident = incidents.find((item) => item.id === id || shortId(item.id) === id) ||
        await getIncident(message.guild.id, id);

      if (!incident) return respond.reply(message, 'bad', 'I could not find that incident.');

      return respond.reply(message, 'info', null, {
        title: `Anti-Nuke Incident ${shortId(incident.id)}`,
        description: [
          `Status: **${incident.status}**`,
          `Severity: **${incident.severity}**`,
          `Executor: ${incident.executor_id ? `<@${incident.executor_id}>` : 'Unknown'}`,
          `Score: **${incident.score}**`,
          `Actions: ${incident.action_types?.join(', ') || 'unknown'}`
        ].join('\n'),
        fields: [
          {
            name: 'Punishments',
            value: incident.punishment_results?.length
              ? incident.punishment_results.map((result) => `• ${result.type}: ${result.ok ? 'OK' : 'Failed'} — ${result.details}`).join('\n').slice(0, 1024)
              : 'None'
          },
          {
            name: 'Rollback',
            value: incident.rollback_results?.length
              ? incident.rollback_results.map((result) => `• ${result.action}: ${result.ok ? 'OK' : 'Failed'} — ${result.detail}`).join('\n').slice(0, 1024)
              : 'None'
          }
        ],
        mentionUser: false
      });
    }

    if (sub === 'reset') {
      if (message.guild.ownerId !== message.author.id && !isBotOwner(message.author.id)) {
        return respond.reply(message, 'bad', 'Only the server owner can reset anti-nuke settings.');
      }

      const saved = await saveAntinuke(message, () => ({
        enabled: false
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved ? 'Anti-nuke settings were reset.' : 'I could not reset anti-nuke settings.');
    }

    if (sub === 'check' || sub === 'health') {
      const health = botHealthCheck(message.guild);
      const me = message.guild.members.me;

      return respond.reply(message, health.ok ? 'good' : 'warn', null, {
        title: 'Anti-Nuke Health Check',
        description: [
          `Status: **${health.ok ? 'Ready' : 'Needs attention'}**`,
          `Rumi highest role: ${health.highestRole || 'Unknown'}`,
          `Bot manageable members depend on role hierarchy.`,
          '',
          health.missing.length
            ? `Missing permissions:\n${health.missing.map((item) => `• \`${item}\``).join('\n')}`
            : 'All key anti-nuke permissions are present.'
        ].join('\n'),
        fields: [
          {
            name: 'Important hierarchy note',
            value: me.roles.highest
              ? 'Rumi can only strip/punish members below its highest role.'
              : 'Could not resolve Rumi member role.',
            inline: false
          }
        ],
        mentionUser: false
      });
    }

    if (sub === 'preset') {
      const name = String(args.shift() || '').toLowerCase();
      const preset = presetConfig(name);
    
      if (!preset) {
        return respond.reply(message, 'info', 'Use `antinuke preset <low|normal|strict|paranoid>`.');
      }
    
      const saved = await saveAntinuke(message, (current) => ({
        ...preset,
        enabled: current.enabled,
        admins: current.admins,
        trustedUsers: current.trustedUsers,
        trustedRoles: current.trustedRoles,
        trustedBots: current.trustedBots,
        whitelist: current.whitelist,
        logChannelId: current.logChannelId,
        alertRoleId: current.alertRoleId,
        ownerDm: current.ownerDm,
        trustNoOne: current.trustNoOne
      }));
    
      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-nuke preset set to **${name}**.`
        : 'I could not apply that preset.');
    }

    if (sub === 'combined') {
      const first = String(args.shift() || '').toLowerCase();
    
      if (!first) {
        return respond.reply(message, 'info', [
          `Combined score: **${config.combinedScore?.enabled ? 'Enabled' : 'Disabled'}**`,
          `Limit: **${config.combinedScore?.limit}**`,
          `Window: **${config.combinedScore?.windowSeconds}s**`
        ].join('\n'));
      }
    
      if (first === 'off' || first === 'disable') {
        const saved = await saveAntinuke(message, (current) => ({
          ...current,
          combinedScore: {
            ...current.combinedScore,
            enabled: false
          }
        }));
      
        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? 'Combined score detection is now disabled.'
          : 'I could not update combined score detection.');
      }
    
      if (first === 'on' || first === 'enable') {
        const saved = await saveAntinuke(message, (current) => ({
          ...current,
          combinedScore: {
            ...current.combinedScore,
            enabled: true
          }
        }));
      
        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? 'Combined score detection is now enabled.'
          : 'I could not update combined score detection.');
      }
    
      const limit = Number(first);
      const seconds = Number(args.shift());
    
      if (!Number.isFinite(limit) || !Number.isFinite(seconds)) {
        return respond.reply(message, 'info', 'Use `antinuke combined <score> <seconds>`.');
      }
    
      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        combinedScore: {
          enabled: true,
          limit,
          windowSeconds: seconds
        }
      }));
    
      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Combined score set to **${limit}/${seconds}s**.`
        : 'I could not save combined score settings.');
    }

    if (sub === 'timeout') {
      const type = String(args.shift() || '').toLowerCase();
      const duration = parseDurationMs(args.shift());
    
      if (!['normal', 'severe'].includes(type) || !duration) {
        return respond.reply(message, 'info', [
          '**Usage**',
          '```txt',
          'antinuke timeout normal 12h',
          'antinuke timeout severe 7d',
          '```',
          '',
          `Current normal: **${formatMs(config.timeoutMs)}**`,
          `Current severe: **${formatMs(config.severeTimeoutMs)}**`
        ].join('\n'));
      }
    
      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        timeoutMs: type === 'normal' ? duration : current.timeoutMs,
        severeTimeoutMs: type === 'severe' ? duration : current.severeTimeoutMs
      }));
    
      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-nuke ${type} timeout set to **${formatMs(duration)}**.`
        : 'I could not save timeout settings.');
    }

    if (sub === 'alertrole') {
      const token = args.join(' ');
    
      if (!token || token.toLowerCase() === 'clear') {
        const saved = await saveAntinuke(message, (current) => ({
          ...current,
          alertRoleId: null
        }));
      
        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? 'Anti-nuke alert role cleared.'
          : 'I could not clear the alert role.');
      }
    
      const role = resolveRole(message, token);
    
      if (!role) {
        return respond.reply(message, 'info', 'Use `antinuke alertrole @role` or `antinuke alertrole clear`.');
      }
    
      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        alertRoleId: role.id
      }));
    
      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-nuke alert role set to ${role}.`
        : 'I could not save the alert role.');
    }

    if (sub === 'ownerdm') {
      const mode = String(args.shift() || '').toLowerCase();
    
      if (!['on', 'off', 'enable', 'disable'].includes(mode)) {
        return respond.reply(message, 'info', `Owner DM is currently **${config.ownerDm ? 'on' : 'off'}**. Use \`antinuke ownerdm <on|off>\`.`);
      }
    
      const enabled = mode === 'on' || mode === 'enable';
    
      const saved = await saveAntinuke(message, (current) => ({
        ...current,
        ownerDm: enabled
      }));
    
      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-nuke owner DM is now **${enabled ? 'on' : 'off'}**.`
        : 'I could not update owner DM settings.');
    }

    return respond.reply(message, 'info', 'Use `antinuke status`, `antinuke actions`, `antinuke threshold`, `antinuke punishment`, `antinuke rollback`, `antinuke trust`, or `antinuke incidents`.');
  }
};