const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

const {
  getProtectionSettings,
  updateProtectionSection,
  enableSecuritySystem
} = require('../../systems/security/protectionConfig');

const {
  RAID_ACTIONS,
  createAntiraidPreset,
  normalizeActions,
  normalizeAntiraidConfig
} = require('../../systems/antiraid/config');

const {
  activateRaidMode,
  deactivateRaidMode,
  isRaidModeActive
} = require('../../systems/antiraid/raidMode');

const {
  listRaidIncidents,
  getRaidIncident,
  updateRaidIncident,
  shortRaidId
} = require('../../systems/antiraid/incidentStore');

const { snapshotInvites } = require('../../systems/antiraid/inviteTracker');
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

function resolveChannel(message, value) {
  const mention = message.mentions.channels.first();
  if (mention) return mention;

  const id = extractId(value);
  if (id) return message.guild.channels.cache.get(id) || null;

  const query = String(value || '').toLowerCase().replace(/^#/, '');

  return message.guild.channels.cache.find((channel) =>
    channel.name?.toLowerCase() === query ||
    channel.name?.toLowerCase().includes(query)
  ) || null;
}

function boolText(value) {
  return value ? 'Enabled' : 'Disabled';
}

function formatActions(actions = []) {
  return actions.length ? actions.map((item) => `\`${item}\``).join(' → ') : '`none`';
}

function formatStatus(config) {
  return [
    `Enabled: **${boolText(config.enabled)}**`,
    `Preset: **${config.preset || 'normal'}**`,
    `Raid mode active: **${isRaidModeActive(config) ? 'Yes' : 'No'}**`,
    '',
    '**Join Defense**',
    `Join threshold: **${config.join.limit}/${config.join.windowSeconds}s**`,
    `Member risk threshold: **${config.join.memberRiskThreshold}**`,
    `Wave risk threshold: **${config.join.waveRiskThreshold}**`,
    `Fresh account threshold: **${config.join.accountAgeHours}h**`,
    '',
    '**Message Defense**',
    `Spam threshold: **${config.message.spamLimit}/${config.message.spamWindowSeconds}s**`,
    `Mention limit: **${config.message.mentionLimit}**`,
    `Link limit: **${config.message.linkLimit}**`,
    `Duplicate limit: **${config.message.duplicateLimit}**`,
    '',
    '**Configured Roles/Channels**',
    `Quarantine role: ${config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : '**none**'}`,
    `Verification role: ${config.verificationRoleId ? `<@&${config.verificationRoleId}>` : '**none**'}`,
    `Verification channel: ${config.verificationChannelId ? `<#${config.verificationChannelId}>` : '**none**'}`,
    `Log channel: ${config.logChannelId ? `<#${config.logChannelId}>` : '**default logs**'}`,
    `Alert role: ${config.alertRoleId ? `<@&${config.alertRoleId}>` : '**none**'}`,
    `Owner DM: **${boolText(config.ownerDm)}**`
  ].join('\n');
}

function formatRaidMode(config) {
  const mode = config.raidMode;

  return [
    `Enabled: **${boolText(mode.enabled)}**`,
    `Active: **${boolText(isRaidModeActive(config))}**`,
    `Duration: **${mode.durationSeconds}s**`,
    `Quiet end: **${mode.quietSecondsToEnd}s**`,
    `Slowmode: **${mode.slowmodeSeconds}s**`,
    `Lock channels: **${boolText(mode.lockChannels)}**`,
    `Actions: ${formatActions(mode.actions)}`,
    mode.startedAt ? `Started: **${mode.startedAt}**` : null,
    mode.endsAt ? `Ends: **${mode.endsAt}**` : null,
    mode.activeIncidentId ? `Incident: \`${shortRaidId(mode.activeIncidentId)}\`` : null
  ].filter(Boolean).join('\n');
}

function listIds(ids = [], type = 'user') {
  if (!ids.length) return 'None';

  return ids.map((id) => {
    if (type === 'role') return `<@&${id}>`;
    if (type === 'channel') return `<#${id}>`;
    return `<@${id}>`;
  }).join(', ');
}

async function saveAntiraid(message, updater) {
  const saved = await updateProtectionSection(message.guild.id, 'antiraid', (current) => {
    const currentNormalized = normalizeAntiraidConfig(current || {});
    const next = typeof updater === 'function' ? updater(currentNormalized) : updater;
    return normalizeAntiraidConfig(next);
  }).catch(() => null);

  return saved ? normalizeAntiraidConfig(saved) : null;
}

async function canManageAntiraid(message, config, ownerOnly = false) {
  if (isBotOwner(message.author.id)) return true;
  if (message.guild.ownerId === message.author.id) return true;
  if (ownerOnly) return false;

  return config.admins?.includes(message.author.id);
}

function parseNumber(value, fallback = null) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.round(number);
}

function usage(lines = []) {
  return ['**Usage**', '```txt', ...lines, '```'].join('\n');
}

function botHealthCheck(guild) {
  const me = guild.members.me;
  const missing = [];

  const required = [
    ['ViewAuditLog', PermissionFlagsBits.ViewAuditLog],
    ['ManageRoles', PermissionFlagsBits.ManageRoles],
    ['ManageChannels', PermissionFlagsBits.ManageChannels],
    ['ModerateMembers', PermissionFlagsBits.ModerateMembers],
    ['KickMembers', PermissionFlagsBits.KickMembers],
    ['BanMembers', PermissionFlagsBits.BanMembers],
    ['ManageWebhooks', PermissionFlagsBits.ManageWebhooks],
    ['SendMessages', PermissionFlagsBits.SendMessages],
    ['EmbedLinks', PermissionFlagsBits.EmbedLinks]
  ];

  for (const [name, bit] of required) {
    if (!me?.permissions?.has(bit)) missing.push(name);
  }

  return {
    ok: missing.length === 0,
    missing,
    highestRole: me?.roles?.highest || null
  };
}

module.exports = {
  name: 'antiraid',
  aliases: ['ar', 'raidguard', 'raid'],
  category: 'security',
  description: 'Advanced anti-raid protection for mass joins, bot raids, spam waves, invite abuse, and raid mode.',
  usage: [
    'antiraid status',
    'antiraid enable',
    'antiraid preset strict',
    'antiraid join threshold count seconds',
    'antiraid message spam count seconds',
    'antiraid raidmode on',
    'antiraid quarantine role @role',
    'antiraid incidents'
  ],
  examples: [
    'antiraid enable',
    'antiraid preset strict',
    'antiraid join threshold 5 20',
    'antiraid message spam 4 8',
    'antiraid quarantine role @Quarantine',
    'antiraid raidmode on'
  ],
  subcommands: [
    { name: 'status', description: 'Show anti-raid status.', usage: ['antiraid status'], examples: ['antiraid status'] },
    { name: 'enable', aliases: ['on'], description: 'Enable anti-raid.', usage: ['antiraid enable'], examples: ['antiraid enable'] },
    { name: 'disable', aliases: ['off'], description: 'Disable anti-raid. Server owner only.', usage: ['antiraid disable'], examples: ['antiraid disable'] },
    { name: 'check', aliases: ['health'], description: 'Check bot permissions needed for anti-raid.', usage: ['antiraid check'], examples: ['antiraid check'] },
    { name: 'preset', description: 'Apply an anti-raid preset.', usage: ['antiraid preset low', 'antiraid preset normal', 'antiraid preset strict', 'antiraid preset paranoid'], examples: ['antiraid preset strict'] },
    { name: 'join', description: 'Configure join-wave detection.', usage: ['antiraid join threshold count seconds', 'antiraid join risk member score', 'antiraid join risk wave score', 'antiraid join accountage hours'], examples: ['antiraid join threshold 5 20'] },
    { name: 'message', description: 'Configure message/spam raid detection.', usage: ['antiraid message spam count seconds', 'antiraid message mention count', 'antiraid message link count', 'antiraid message duplicate count'], examples: ['antiraid message spam 4 8'] },
    { name: 'raidmode', description: 'Manage raid mode.', usage: ['antiraid raidmode status', 'antiraid raidmode on', 'antiraid raidmode off', 'antiraid raidmode duration seconds'], examples: ['antiraid raidmode on'] },
    { name: 'punishment', description: 'Configure anti-raid punishments.', usage: ['antiraid punishment medium actions', 'antiraid punishment high actions', 'antiraid punishment critical actions', 'antiraid punishment message actions'], examples: ['antiraid punishment high quarantine timeout'] },
    { name: 'quarantine', description: 'Set quarantine role.', usage: ['antiraid quarantine role @role', 'antiraid quarantine clear'], examples: ['antiraid quarantine role @Quarantine'] },
    { name: 'verify', description: 'Set verification role/channel.', usage: ['antiraid verify role @role', 'antiraid verify channel #channel', 'antiraid verify clear'], examples: ['antiraid verify role @Verify'] },
    { name: 'admin', description: 'Manage anti-raid admins. Server owner only.', usage: ['antiraid admin add @user', 'antiraid admin remove @user', 'antiraid admin list'], examples: ['antiraid admin add @Security'] },
    { name: 'trust', description: 'Manage trusted anti-raid users, roles, and bots.', usage: ['antiraid trust user add @user', 'antiraid trust role add @role', 'antiraid trust bot add @bot'], examples: ['antiraid trust role add @Trusted'] },
    { name: 'ignore', description: 'Manage ignored channels, roles, invites, and domains.', usage: ['antiraid ignore channel add #channel', 'antiraid ignore role add @role', 'antiraid ignore invite add code', 'antiraid ignore domain add domain.com'], examples: ['antiraid ignore channel add #bot-cmds'] },
    { name: 'logchannel', description: 'Set anti-raid log channel.', usage: ['antiraid logchannel #channel', 'antiraid logchannel clear'], examples: ['antiraid logchannel #security-logs'] },
    { name: 'alertrole', description: 'Set anti-raid alert role.', usage: ['antiraid alertrole @role', 'antiraid alertrole clear'], examples: ['antiraid alertrole @Security'] },
    { name: 'ownerdm', description: 'Enable or disable owner DM alerts.', usage: ['antiraid ownerdm on', 'antiraid ownerdm off'], examples: ['antiraid ownerdm on'] },
    { name: 'incidents', description: 'List recent anti-raid incidents.', usage: ['antiraid incidents'], examples: ['antiraid incidents'] },
    { name: 'incident', description: 'View one anti-raid incident.', usage: ['antiraid incident id'], examples: ['antiraid incident 1234abcd'] },
    { name: 'reset', description: 'Reset anti-raid config. Server owner only.', usage: ['antiraid reset'], examples: ['antiraid reset'] },
    {
      name: 'resolve',
      description: 'Mark an anti-raid incident as resolved.',
      usage: ['antiraid resolve id'],
      examples: ['antiraid resolve 1234abcd']
    },
    {
      name: 'rollback',
      description: 'Rollback reversible raid-mode channel changes for an incident.',
      usage: ['antiraid rollback id'],
      examples: ['antiraid rollback 1234abcd']
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const protection = await getProtectionSettings(message.guild.id).catch(() => null);

    if (!protection) {
      return respond.reply(message, 'bad', 'I could not load anti-raid settings because the database is unreachable.');
    }

    const config = normalizeAntiraidConfig(protection.antiraid || protection.settings?.antiraid || {});
    const sub = String(args.shift() || 'status').toLowerCase();

    const ownerOnlySubs = ['disable', 'off', 'reset'];
    if (!(await canManageAntiraid(message, config, ownerOnlySubs.includes(sub)))) {
      return respond.reply(message, 'bad', 'Only the server owner or configured anti-raid admins can manage anti-raid.');
    }

    if (sub === 'status') {
      return respond.reply(message, 'info', null, {
        title: 'Advanced Anti-Raid Status',
        description: formatStatus(config),
        mentionUser: false
      });
    }

    if (sub === 'enable' || sub === 'on') {
      const saved = await enableSecuritySystem(message.guild.id, 'antiraid').catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not enable anti-raid.');
      }

      await snapshotInvites(message.guild).catch(() => null);

      return respond.reply(message, 'good', 'Advanced anti-raid is now enabled. Invite cache has been refreshed.');
    }

    if (sub === 'disable' || sub === 'off') {
      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        enabled: false
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? 'Anti-raid is now disabled.'
        : 'I could not disable anti-raid.');
    }

    if (sub === 'check' || sub === 'health') {
      const health = botHealthCheck(message.guild);

      return respond.reply(message, health.ok ? 'good' : 'warn', null, {
        title: 'Anti-Raid Health Check',
        description: [
          `Status: **${health.ok ? 'Ready' : 'Needs attention'}**`,
          `Rumi highest role: ${health.highestRole || 'Unknown'}`,
          '',
          health.missing.length
            ? `Missing permissions:\n${health.missing.map((item) => `• \`${item}\``).join('\n')}`
            : 'All key anti-raid permissions are present.',
          '',
          'Rumi can only quarantine, timeout, kick, or ban members below its highest role.'
        ].join('\n'),
        mentionUser: false
      });
    }

    if (sub === 'preset') {
      const name = String(args.shift() || '').toLowerCase();
      const preset = createAntiraidPreset(name);

      if (!['low', 'normal', 'strict', 'paranoid'].includes(name)) {
        return respond.reply(message, 'info', 'Use `antiraid preset <low|normal|strict|paranoid>`.');
      }

      const saved = await saveAntiraid(message, (current) => ({
        ...preset,
        enabled: current.enabled,
        admins: current.admins,
        trustedUsers: current.trustedUsers,
        trustedRoles: current.trustedRoles,
        trustedBots: current.trustedBots,
        ignoredChannels: current.ignoredChannels,
        ignoredRoles: current.ignoredRoles,
        ignoredInvites: current.ignoredInvites,
        ignoredDomains: current.ignoredDomains,
        logChannelId: current.logChannelId,
        alertRoleId: current.alertRoleId,
        ownerDm: current.ownerDm,
        quarantineRoleId: current.quarantineRoleId,
        verificationRoleId: current.verificationRoleId,
        verificationChannelId: current.verificationChannelId
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-raid preset set to **${name}**.`
        : 'I could not apply that anti-raid preset.');
    }

    if (sub === 'join') {
      const mode = String(args.shift() || 'status').toLowerCase();

      if (mode === 'status') {
        return respond.reply(message, 'info', null, {
          title: 'Anti-Raid Join Detection',
          description: [
            `Enabled: **${boolText(config.join.enabled)}**`,
            `Join threshold: **${config.join.limit}/${config.join.windowSeconds}s**`,
            `Member risk threshold: **${config.join.memberRiskThreshold}**`,
            `Wave risk threshold: **${config.join.waveRiskThreshold}**`,
            `Fresh account threshold: **${config.join.accountAgeHours}h**`,
            '',
            `Medium actions: ${formatActions(config.join.punishments.medium)}`,
            `High actions: ${formatActions(config.join.punishments.high)}`,
            `Critical actions: ${formatActions(config.join.punishments.critical)}`
          ].join('\n'),
          mentionUser: false
        });
      }

      if (mode === 'threshold') {
        const limit = parseNumber(args.shift());
        const seconds = parseNumber(args.shift());

        if (!limit || !seconds) {
          return respond.reply(message, 'info', usage(['antiraid join threshold count seconds']));
        }

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          preset: 'custom',
          join: {
            ...current.join,
            limit,
            windowSeconds: seconds
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Join threshold set to **${limit}/${seconds}s**.`
          : 'I could not update join threshold.');
      }

      if (mode === 'risk') {
        const type = String(args.shift() || '').toLowerCase();
        const score = parseNumber(args.shift());

        if (!['member', 'wave'].includes(type) || score === null) {
          return respond.reply(message, 'info', usage(['antiraid join risk member score', 'antiraid join risk wave score']));
        }

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          preset: 'custom',
          join: {
            ...current.join,
            memberRiskThreshold: type === 'member' ? score : current.join.memberRiskThreshold,
            waveRiskThreshold: type === 'wave' ? score : current.join.waveRiskThreshold
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Join ${type} risk threshold set to **${score}**.`
          : 'I could not update risk threshold.');
      }

      if (mode === 'accountage') {
        const hours = parseNumber(args.shift());

        if (!hours) {
          return respond.reply(message, 'info', usage(['antiraid join accountage hours']));
        }

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          preset: 'custom',
          join: {
            ...current.join,
            accountAgeHours: hours
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Fresh-account threshold set to **${hours}h**.`
          : 'I could not update account-age threshold.');
      }

      return respond.reply(message, 'info', usage([
        'antiraid join status',
        'antiraid join threshold count seconds',
        'antiraid join risk member score',
        'antiraid join risk wave score',
        'antiraid join accountage hours'
      ]));
    }

    if (sub === 'message') {
      const mode = String(args.shift() || 'status').toLowerCase();

      if (mode === 'status') {
        return respond.reply(message, 'info', null, {
          title: 'Anti-Raid Message Detection',
          description: [
            `Enabled: **${boolText(config.message.enabled)}**`,
            `New member window: **${config.message.newMemberWindowMinutes}m**`,
            `Spam: **${config.message.spamLimit}/${config.message.spamWindowSeconds}s**`,
            `Mentions: **${config.message.mentionLimit}**`,
            `Links: **${config.message.linkLimit}**`,
            `Duplicates: **${config.message.duplicateLimit}**`,
            `Actions: ${formatActions(config.message.punishment)}`
          ].join('\n'),
          mentionUser: false
        });
      }

      if (mode === 'spam') {
        const limit = parseNumber(args.shift());
        const seconds = parseNumber(args.shift());

        if (!limit || !seconds) {
          return respond.reply(message, 'info', usage(['antiraid message spam count seconds']));
        }

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          preset: 'custom',
          message: {
            ...current.message,
            spamLimit: limit,
            spamWindowSeconds: seconds
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Message spam threshold set to **${limit}/${seconds}s**.`
          : 'I could not update message spam threshold.');
      }

      if (['mention', 'mentions', 'link', 'links', 'duplicate', 'duplicates', 'newmember'].includes(mode)) {
        const value = parseNumber(args.shift());

        if (!value) {
          return respond.reply(message, 'info', usage([
            'antiraid message mention count',
            'antiraid message link count',
            'antiraid message duplicate count',
            'antiraid message newmember minutes'
          ]));
        }

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          preset: 'custom',
          message: {
            ...current.message,
            mentionLimit: ['mention', 'mentions'].includes(mode) ? value : current.message.mentionLimit,
            linkLimit: ['link', 'links'].includes(mode) ? value : current.message.linkLimit,
            duplicateLimit: ['duplicate', 'duplicates'].includes(mode) ? value : current.message.duplicateLimit,
            newMemberWindowMinutes: mode === 'newmember' ? value : current.message.newMemberWindowMinutes
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Message **${mode}** setting updated to **${value}**.`
          : 'I could not update message setting.');
      }

      return respond.reply(message, 'info', usage([
        'antiraid message status',
        'antiraid message spam count seconds',
        'antiraid message mention count',
        'antiraid message link count',
        'antiraid message duplicate count',
        'antiraid message newmember minutes'
      ]));
    }

    if (sub === 'raidmode') {
      const mode = String(args.shift() || 'status').toLowerCase();

      if (mode === 'status') {
        return respond.reply(message, 'info', null, {
          title: 'Anti-Raid Raid Mode',
          description: formatRaidMode(config),
          mentionUser: false
        });
      }

      if (mode === 'on' || mode === 'enable') {
        const result = await activateRaidMode({
          guild: message.guild,
          config,
          reason: `Manual anti-raid raid mode by ${message.author.tag}`
        });

        return respond.reply(message, result.ok ? 'good' : 'bad', result.ok
          ? 'Raid mode is now active.'
          : result.detail || 'I could not activate raid mode.');
      }

      if (mode === 'off' || mode === 'disable') {
        const result = await deactivateRaidMode({
          guild: message.guild,
          config,
          reason: `Manual anti-raid raid mode end by ${message.author.tag}`
        });

        return respond.reply(message, result.ok ? 'good' : 'bad', result.ok
          ? 'Raid mode is now disabled and saved channel states were restored.'
          : result.detail || 'I could not disable raid mode.');
      }

      if (mode === 'duration') {
        const seconds = parseNumber(args.shift());

        if (!seconds) {
          return respond.reply(message, 'info', usage(['antiraid raidmode duration seconds']));
        }

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          raidMode: {
            ...current.raidMode,
            durationSeconds: seconds
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Raid mode duration set to **${seconds}s**.`
          : 'I could not update raid mode duration.');
      }

      if (mode === 'slowmode') {
        const seconds = parseNumber(args.shift());

        if (seconds === null) {
          return respond.reply(message, 'info', usage(['antiraid raidmode slowmode seconds']));
        }

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          raidMode: {
            ...current.raidMode,
            slowmodeSeconds: seconds
          }
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Raid mode slowmode set to **${seconds}s**.`
          : 'I could not update raid mode slowmode.');
      }

      if (mode === 'action') {
        const actionMode = String(args.shift() || '').toLowerCase();
        const action = String(args.shift() || '').toLowerCase().replaceAll('-', '_');

        if (!['add', 'remove'].includes(actionMode) || !RAID_ACTIONS.includes(action)) {
          return respond.reply(message, 'info', usage(['antiraid raidmode action add action', 'antiraid raidmode action remove action']));
        }

        const saved = await saveAntiraid(message, (current) => {
          const set = new Set(current.raidMode.actions || []);

          if (actionMode === 'add') set.add(action);
          else set.delete(action);

          return {
            ...current,
            raidMode: {
              ...current.raidMode,
              actions: [...set]
            }
          };
        });

        return respond.reply(message, saved ? 'good' : 'bad', saved
          ? `Raid mode action **${action}** ${actionMode === 'add' ? 'added' : 'removed'}.`
          : 'I could not update raid mode actions.');
      }

      return respond.reply(message, 'info', usage([
        'antiraid raidmode status',
        'antiraid raidmode on',
        'antiraid raidmode off',
        'antiraid raidmode duration seconds',
        'antiraid raidmode slowmode seconds',
        'antiraid raidmode action add action',
        'antiraid raidmode action remove action'
      ]));
    }

    if (sub === 'punishment') {
      const band = String(args.shift() || '').toLowerCase();
      const actions = normalizeActions(args);

      if (!actions.length) {
        return respond.reply(message, 'info', `Valid actions: ${RAID_ACTIONS.map((item) => `\`${item}\``).join(', ')}`);
      }

      const saved = await saveAntiraid(message, (current) => {
        if (['medium', 'high', 'critical'].includes(band)) {
          return {
            ...current,
            preset: 'custom',
            join: {
              ...current.join,
              punishments: {
                ...current.join.punishments,
                [band]: actions
              }
            }
          };
        }

        if (band === 'message') {
          return {
            ...current,
            preset: 'custom',
            message: {
              ...current.message,
              punishment: actions
            }
          };
        }

        if (band === 'botraid' || band === 'bot') {
          return {
            ...current,
            preset: 'custom',
            botRaid: {
              ...current.botRaid,
              punishment: actions
            }
          };
        }

        return current;
      });

      if (!['medium', 'high', 'critical', 'message', 'botraid', 'bot'].includes(band)) {
        return respond.reply(message, 'info', usage([
          'antiraid punishment medium actions',
          'antiraid punishment high actions',
          'antiraid punishment critical actions',
          'antiraid punishment message actions',
          'antiraid punishment botraid actions'
        ]));
      }

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-raid punishment for **${band}** set to ${formatActions(actions)}.`
        : 'I could not update anti-raid punishment.');
    }

    if (sub === 'quarantine') {
      const mode = String(args.shift() || '').toLowerCase();

      if (mode === 'clear') {
        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          quarantineRoleId: null
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved ? 'Quarantine role cleared.' : 'I could not clear quarantine role.');
      }

      if (mode !== 'role') {
        return respond.reply(message, 'info', usage(['antiraid quarantine role @role', 'antiraid quarantine clear']));
      }

      const role = resolveRole(message, args.join(' '));

      if (!role) return respond.reply(message, 'bad', 'I could not find that role.');

      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        quarantineRoleId: role.id
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Quarantine role set to ${role}.`
        : 'I could not save quarantine role.');
    }

    if (sub === 'verify') {
      const mode = String(args.shift() || '').toLowerCase();

      if (mode === 'clear') {
        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          verificationRoleId: null,
          verificationChannelId: null
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved ? 'Verification settings cleared.' : 'I could not clear verification settings.');
      }

      if (mode === 'role') {
        const role = resolveRole(message, args.join(' '));
        if (!role) return respond.reply(message, 'bad', 'I could not find that role.');

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          verificationRoleId: role.id
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved ? `Verification role set to ${role}.` : 'I could not save verification role.');
      }

      if (mode === 'channel') {
        const channel = resolveChannel(message, args.join(' '));
        if (!channel) return respond.reply(message, 'bad', 'I could not find that channel.');

        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          verificationChannelId: channel.id
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved ? `Verification channel set to ${channel}.` : 'I could not save verification channel.');
      }

      return respond.reply(message, 'info', usage(['antiraid verify role @role', 'antiraid verify channel #channel', 'antiraid verify clear']));
    }

    if (sub === 'admin') {
      if (message.guild.ownerId !== message.author.id && !isBotOwner(message.author.id)) {
        return respond.reply(message, 'bad', 'Only the server owner can manage anti-raid admins.');
      }

      const mode = String(args.shift() || 'list').toLowerCase();

      if (mode === 'list') {
        return respond.reply(message, 'info', `Anti-raid admins: ${listIds(config.admins)}`);
      }

      const member = await resolveMember(message, args.join(' '));
      if (!member) return respond.reply(message, 'info', usage(['antiraid admin add @user', 'antiraid admin remove @user', 'antiraid admin list']));

      const admins = new Set(config.admins || []);

      if (mode === 'add') admins.add(member.id);
      else if (mode === 'remove' || mode === 'delete') admins.delete(member.id);
      else return respond.reply(message, 'info', usage(['antiraid admin add @user', 'antiraid admin remove @user', 'antiraid admin list']));

      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        admins: [...admins]
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-raid admins updated: ${listIds([...admins])}`
        : 'I could not update anti-raid admins.');
    }

    if (sub === 'trust') {
      const type = String(args.shift() || '').toLowerCase();
      const mode = String(args.shift() || 'list').toLowerCase();

      const key = type === 'user'
        ? 'trustedUsers'
        : type === 'role'
          ? 'trustedRoles'
          : type === 'bot'
            ? 'trustedBots'
            : null;

      if (!key) {
        return respond.reply(message, 'info', usage([
          'antiraid trust user add @user',
          'antiraid trust role add @role',
          'antiraid trust bot add @bot',
          'antiraid trust user list'
        ]));
      }

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

      if (!id) return respond.reply(message, 'bad', 'I could not resolve that trust target.');

      const values = new Set(config[key] || []);

      if (mode === 'add') values.add(id);
      else if (mode === 'remove' || mode === 'delete') values.delete(id);
      else return respond.reply(message, 'info', usage(['antiraid trust user add @user', 'antiraid trust role add @role', 'antiraid trust bot add @bot']));

      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        [key]: [...values]
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Updated ${type} trust list.`
        : 'I could not update trust list.');
    }

    if (sub === 'ignore') {
      const type = String(args.shift() || '').toLowerCase();
      const mode = String(args.shift() || 'list').toLowerCase();

      const key = type === 'channel'
        ? 'ignoredChannels'
        : type === 'role'
          ? 'ignoredRoles'
          : type === 'invite'
            ? 'ignoredInvites'
            : type === 'domain'
              ? 'ignoredDomains'
              : null;

      if (!key) {
        return respond.reply(message, 'info', usage([
          'antiraid ignore channel add #channel',
          'antiraid ignore role add @role',
          'antiraid ignore invite add code',
          'antiraid ignore domain add domain.com'
        ]));
      }

      if (mode === 'list') {
        return respond.reply(message, 'info', `${type} ignore list: ${type === 'channel' ? listIds(config[key], 'channel') : type === 'role' ? listIds(config[key], 'role') : config[key].join(', ') || 'None'}`);
      }

      let value = null;

      if (type === 'channel') value = resolveChannel(message, args.join(' '))?.id;
      else if (type === 'role') value = resolveRole(message, args.join(' '))?.id;
      else value = String(args.join(' ') || '').trim();

      if (!value) return respond.reply(message, 'bad', 'I could not resolve that ignore target.');

      const values = new Set(config[key] || []);

      if (mode === 'add') values.add(value);
      else if (mode === 'remove' || mode === 'delete') values.delete(value);
      else return respond.reply(message, 'info', usage(['antiraid ignore channel add #channel', 'antiraid ignore role add @role', 'antiraid ignore invite add code', 'antiraid ignore domain add domain.com']));

      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        [key]: [...values]
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Updated ${type} ignore list.`
        : 'I could not update ignore list.');
    }

    if (sub === 'logchannel') {
      const token = args.join(' ');

      if (!token || token.toLowerCase() === 'clear') {
        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          logChannelId: null
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved ? 'Anti-raid log channel cleared.' : 'I could not clear log channel.');
      }

      const channel = resolveChannel(message, token);
      if (!channel) return respond.reply(message, 'bad', 'I could not find that channel.');

      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        logChannelId: channel.id
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved ? `Anti-raid log channel set to ${channel}.` : 'I could not save log channel.');
    }

    if (sub === 'alertrole') {
      const token = args.join(' ');

      if (!token || token.toLowerCase() === 'clear') {
        const saved = await saveAntiraid(message, (current) => ({
          ...current,
          alertRoleId: null
        }));

        return respond.reply(message, saved ? 'good' : 'bad', saved ? 'Anti-raid alert role cleared.' : 'I could not clear alert role.');
      }

      const role = resolveRole(message, token);
      if (!role) return respond.reply(message, 'bad', 'I could not find that role.');

      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        alertRoleId: role.id
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved ? `Anti-raid alert role set to ${role}.` : 'I could not save alert role.');
    }

    if (sub === 'ownerdm') {
      const mode = String(args.shift() || '').toLowerCase();

      if (!['on', 'off', 'enable', 'disable'].includes(mode)) {
        return respond.reply(message, 'info', `Owner DM is currently **${config.ownerDm ? 'on' : 'off'}**. Use \`antiraid ownerdm <on|off>\`.`);
      }

      const enabled = mode === 'on' || mode === 'enable';

      const saved = await saveAntiraid(message, (current) => ({
        ...current,
        ownerDm: enabled
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-raid owner DM is now **${enabled ? 'on' : 'off'}**.`
        : 'I could not update owner DM setting.');
    }

    if (sub === 'incidents') {
      const incidents = await listRaidIncidents(message.guild.id, {
        limit: 10
      });

      return respond.reply(message, 'info', null, {
        title: 'Recent Anti-Raid Incidents',
        description: incidents.length
          ? incidents.map((incident) =>
              `• \`${shortRaidId(incident.id)}\` — **${incident.status}** — **${incident.severity}** — ${incident.trigger_type} — score ${incident.risk_score}`
            ).join('\n').slice(0, 4000)
          : 'No anti-raid incidents found.',
        mentionUser: false
      });
    }

    if (sub === 'incident') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', usage(['antiraid incident id']));

      const incidents = await listRaidIncidents(message.guild.id, {
        limit: 50
      });

      const incident = incidents.find((item) => item.id === id || shortRaidId(item.id) === id) ||
        await getRaidIncident(message.guild.id, id);

      if (!incident) return respond.reply(message, 'bad', 'I could not find that anti-raid incident.');

      return respond.reply(message, 'info', null, {
        title: `Anti-Raid Incident ${shortRaidId(incident.id)}`,
        description: [
          `Status: **${incident.status}**`,
          `Severity: **${incident.severity}**`,
          `Trigger: **${incident.trigger_type}**`,
          `Risk score: **${incident.risk_score}**`,
          `Messages deleted: **${incident.messages_deleted || 0}**`
        ].join('\n'),
        fields: [
          {
            name: 'Affected users',
            value: Array.isArray(incident.affected_users) && incident.affected_users.length
              ? incident.affected_users.slice(0, 10).map((user) => `• ${user.id ? `<@${user.id}>` : 'Unknown'} ${user.username ? `(${user.username})` : ''}`).join('\n').slice(0, 1024)
              : 'None recorded.',
            inline: false
          },
          {
            name: 'Punishments',
            value: Array.isArray(incident.punishments_applied) && incident.punishments_applied.length
              ? incident.punishments_applied.map((item) => `• ${item.type}: ${item.ok ? 'OK' : 'Failed'} — ${item.details}`).join('\n').slice(0, 1024)
              : 'None recorded.',
            inline: false
          }
        ],
        mentionUser: false
      });
    }

    if (sub === 'resolve') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', usage(['antiraid resolve id']));
        
      const incidents = await listRaidIncidents(message.guild.id, { limit: 50 });
      const incident = incidents.find((item) => item.id === id || shortRaidId(item.id) === id) ||
        await getRaidIncident(message.guild.id, id);
        
      if (!incident) {
        return respond.reply(message, 'bad', 'I could not find that anti-raid incident.');
      }
    
      const saved = await updateRaidIncident(incident.id, {
        status: 'resolved',
        resolved_at: new Date().toISOString()
      });
    
      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `Anti-raid incident \`${shortRaidId(incident.id)}\` marked as resolved.`
        : 'I could not resolve that incident.');
    }
    
    if (sub === 'rollback') {
      const id = args.shift();
      if (!id) return respond.reply(message, 'info', usage(['antiraid rollback id']));
    
      const incidents = await listRaidIncidents(message.guild.id, { limit: 50 });
      const incident = incidents.find((item) => item.id === id || shortRaidId(item.id) === id) ||
        await getRaidIncident(message.guild.id, id);
    
      if (!incident) {
        return respond.reply(message, 'bad', 'I could not find that anti-raid incident.');
      }
    
      const result = await deactivateRaidMode({
        guild: message.guild,
        config,
        incidentId: incident.id,
        reason: `Manual anti-raid incident rollback by ${message.author.tag}`
      });
    
      const saved = await updateRaidIncident(incident.id, {
        status: result.ok ? 'rolled_back' : 'rollback_failed',
        rollback_actions: result.restored || [],
        resolved_at: new Date().toISOString()
      });
    
      return respond.reply(message, result.ok && saved ? 'good' : 'bad', null, {
        title: `Anti-Raid Rollback ${shortRaidId(incident.id)}`,
        description: [
          `Status: **${result.ok ? 'Rolled back' : 'Failed'}**`,
          result.detail ? `Details: ${result.detail}` : null,
          '',
          Array.isArray(result.restored) && result.restored.length
            ? result.restored.map((item) => `• ${item.channelId || 'channel'}: ${item.detail}`).join('\n').slice(0, 3000)
            : 'No saved channel states were found for this incident.'
        ].filter(Boolean).join('\n'),
        mentionUser: false
      });
    }

    if (sub === 'reset') {
      if (message.guild.ownerId !== message.author.id && !isBotOwner(message.author.id)) {
        return respond.reply(message, 'bad', 'Only the server owner can reset anti-raid settings.');
      }

      const saved = await saveAntiraid(message, () => ({
        enabled: false
      }));

      return respond.reply(message, saved ? 'good' : 'bad', saved ? 'Anti-raid settings were reset.' : 'I could not reset anti-raid.');
    }

    return respond.reply(message, 'info', usage([
      'antiraid status',
      'antiraid enable',
      'antiraid preset strict',
      'antiraid join threshold 5 20',
      'antiraid message spam 4 8',
      'antiraid raidmode on',
      'antiraid quarantine role @role',
      'antiraid incidents'
    ]));
  }
};