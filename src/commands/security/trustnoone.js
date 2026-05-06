const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  getTrustNobodySettings,
  updateTrustNobodySettings
} = require('../../systems/security/trustNobody');

function boolLabel(value) {
  return value ? 'Enabled' : 'Disabled';
}

function formatStatus(settings) {
  return [
    `Enabled: **${boolLabel(settings.enabled)}**`,
    `Overbound: **${settings.overboundPercent}%**`,
    `Action: **${settings.action}**`,
    '',
    '**Watched trust layers**',
    `Trusted users: **${boolLabel(settings.includeTrustedUsers)}**`,
    `Trusted roles: **${boolLabel(settings.includeTrustedRoles)}**`,
    `Trusted bots: **${boolLabel(settings.includeTrustedBots)}**`,
    `Whitelists: **${boolLabel(settings.includeWhitelist)}**`,
    `Anti-nuke admins: **${boolLabel(settings.includeAntinukeAdmins)}**`,
    `Fake permission bypass: **${boolLabel(settings.includeFakePermissionBypass)}**`
  ].join('\n');
}

function parsePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.min(500, Math.max(0, Math.round(number)));
}

function onlyOwner(message) {
  return message.guild?.ownerId === message.author.id;
}

module.exports = {
  name: 'trustnoone',
  aliases: ['paranoid', 'beastmode', 'tno'],
  category: 'security',
  description: 'Owner-only beast mode that monitors trusted users, whitelisted users, anti-nuke admins, and bypass roles.',
  usage: [
    'trustnoone status',
    'trustnoone enable percent',
    'trustnoone disable',
    'trustnoone overbound percent',
    'trustnoone action alert',
    'trustnoone action mitigate',
    'trustnoone watch layer on',
    'trustnoone watch layer off'
  ],
  examples: [
    'trustnoone enable 50',
    'trustnoone overbound 75',
    'trustnoone action mitigate',
    'trustnoone watch admins on',
    'trustnoone watch whitelist on'
  ],
  subcommands: [
    {
      name: 'status',
      description: 'Show TrustNoOne settings.',
      usage: ['trustnoone status'],
      examples: ['trustnoone status']
    },
    {
      name: 'enable',
      aliases: ['on'],
      description: 'Enable TrustNoOne mode with an optional overbound percentage.',
      usage: ['trustnoone enable percent'],
      examples: ['trustnoone enable 50']
    },
    {
      name: 'disable',
      aliases: ['off'],
      description: 'Disable TrustNoOne mode.',
      usage: ['trustnoone disable'],
      examples: ['trustnoone disable']
    },
    {
      name: 'overbound',
      aliases: ['percent', 'threshold'],
      description: 'Set how far trusted users may exceed anti-nuke thresholds before Rumi acts.',
      usage: ['trustnoone overbound percent'],
      examples: ['trustnoone overbound 75']
    },
    {
      name: 'action',
      description: 'Set whether TrustNoOne only alerts or fully mitigates.',
      usage: ['trustnoone action alert', 'trustnoone action mitigate'],
      examples: ['trustnoone action mitigate']
    },
    {
      name: 'watch',
      description: 'Toggle which trusted layers TrustNoOne watches.',
      usage: ['trustnoone watch layer on', 'trustnoone watch layer off'],
      examples: [
        'trustnoone watch admins on',
        'trustnoone watch whitelist on',
        'trustnoone watch fakeperms off'
      ]
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    if (!onlyOwner(message)) {
      return respond.reply(message, 'bad', 'Only the server owner can use TrustNoOne mode.');
    }

    const sub = String(args.shift() || 'status').toLowerCase();
    const settings = await getTrustNobodySettings(message.guild.id).catch(() => null);

    if (!settings) {
      return respond.reply(message, 'bad', 'I could not load TrustNoOne settings.');
    }

    if (sub === 'status') {
      return respond.reply(message, 'info', null, {
        title: 'TrustNoOne Beast Mode',
        description: formatStatus(settings),
        mentionUser: false
      });
    }

    if (sub === 'enable' || sub === 'on') {
      const percent = args[0] ? parsePercent(args[0]) : settings.overboundPercent;

      if (percent === null) {
        return respond.reply(message, 'info', 'Use `trustnoone enable <percent>`.');
      }

      const saved = await updateTrustNobodySettings(message.guild.id, (current) => ({
        ...current,
        enabled: true,
        overboundPercent: percent
      })).catch(() => null);

      return respond.reply(message, saved ? 'alert' : 'bad', saved
        ? `TrustNoOne mode is now enabled with **${percent}%** overbound. **All trusted users will be monitored.**`
        : 'I could not enable TrustNoOne mode.');
    }

    if (sub === 'disable' || sub === 'off') {
      const saved = await updateTrustNobodySettings(message.guild.id, (current) => ({
        ...current,
        enabled: false
      })).catch(() => null);

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? 'TrustNoOne mode is now disabled.'
        : 'I could not disable TrustNoOne mode.');
    }

    if (sub === 'overbound' || sub === 'percent' || sub === 'threshold') {
      const percent = parsePercent(args[0]);

      if (percent === null) {
        return respond.reply(message, 'info', 'Use `trustnoone overbound <0-500>`.');
      }

      const saved = await updateTrustNobodySettings(message.guild.id, (current) => ({
        ...current,
        overboundPercent: percent
      })).catch(() => null);

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `TrustNoOne overbound set to **${percent}%**.`
        : 'I could not save the overbound setting.');
    }

    if (sub === 'action') {
      const action = String(args[0] || '').toLowerCase();

      if (!['alert', 'mitigate'].includes(action)) {
        return respond.reply(message, 'info', 'Use `trustnoone action <alert|mitigate>`.');
      }

      const saved = await updateTrustNobodySettings(message.guild.id, (current) => ({
        ...current,
        action
      })).catch(() => null);

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `TrustNoOne action set to **${action}**.`
        : 'I could not save the TrustNoOne action.');
    }

    if (sub === 'watch') {
      const layer = String(args.shift() || '').toLowerCase();
      const mode = String(args.shift() || '').toLowerCase();

      const map = {
        users: 'includeTrustedUsers',
        user: 'includeTrustedUsers',
        roles: 'includeTrustedRoles',
        role: 'includeTrustedRoles',
        bots: 'includeTrustedBots',
        bot: 'includeTrustedBots',
        whitelist: 'includeWhitelist',
        whitelists: 'includeWhitelist',
        admins: 'includeAntinukeAdmins',
        admin: 'includeAntinukeAdmins',
        antinukeadmins: 'includeAntinukeAdmins',
        fakeperms: 'includeFakePermissionBypass',
        fakeperm: 'includeFakePermissionBypass',
        fakepermissions: 'includeFakePermissionBypass'
      };

      const key = map[layer];

      if (!key || !['on', 'off', 'enable', 'disable'].includes(mode)) {
        return respond.reply(message, 'info', [
          '**Usage**',
          '```txt',
          'trustnoone watch users on',
          'trustnoone watch roles off',
          'trustnoone watch bots on',
          'trustnoone watch whitelist on',
          'trustnoone watch admins on',
          'trustnoone watch fakeperms off',
          '```'
        ].join('\n'));
      }

      const enabled = mode === 'on' || mode === 'enable';

      const saved = await updateTrustNobodySettings(message.guild.id, (current) => ({
        ...current,
        [key]: enabled
      })).catch(() => null);

      return respond.reply(message, saved ? 'good' : 'bad', saved
        ? `TrustNoOne watch layer **${layer}** is now **${enabled ? 'enabled' : 'disabled'}**.`
        : 'I could not update that watch layer.');
    }

    return respond.reply(message, 'info', 'Use `trustnoone status`, `enable`, `disable`, `overbound`, `action`, or `watch`.');
  }
};