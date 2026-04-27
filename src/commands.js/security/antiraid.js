const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const {
  getProtectionSettings,
  updateProtectionSection,
  updateProtectionThresholds
} = require('../../systems/security/protectionConfig');

const ACTIONS = new Set(['alert', 'timeout', 'kick', 'jail', 'lock']);

function formatWhitelist(ids = []) {
  return ids.length ? ids.map((id) => `<@${id}>`).join(', ') : 'None';
}

function parseChannelId(input) {
  return String(input || '').match(/^<#?(\d{17,20})>$/)?.[1] || extractId(input);
}

module.exports = {
  name: 'antiraid',
  aliases: ['raidguard', 'raidprotection'],
  category: 'security',
  description: 'Configure anti-raid detection, actions, and verification-channel lockdown.',
  usage: 'antiraid <status|enable|disable|action|threshold|channel|whitelist>',
  examples: [
    'antiraid enable',
    'antiraid action timeout',
    'antiraid threshold joinBurst 8',
    'antiraid channel #verification',
    'antiraid whitelist add @trusted'
  ],
  subcommands: [
    { name: 'status', usage: 'antiraid status', description: 'Show anti-raid state, thresholds, and bypasses.' },
    { name: 'enable', aliases: ['on'], usage: 'antiraid enable', description: 'Enable anti-raid protection.' },
    { name: 'disable', aliases: ['off'], usage: 'antiraid disable', description: 'Disable anti-raid protection.' },
    { name: 'action', usage: 'antiraid action <alert|timeout|kick|jail|lock> [timeoutMinutes]', description: 'Set the anti-raid response action.' },
    { name: 'threshold', usage: 'antiraid threshold <joinBurst|lowAccountAgeDays|lowAgeBurst|quarantineConfidence|lockdownConfidence|windowMs> <value>', description: 'Set anti-raid thresholds.' },
    { name: 'channel', usage: 'antiraid channel <#channel|channelId>', description: 'Set the verification or lock target channel.' },
    { name: 'whitelist', aliases: ['wl'], usage: 'antiraid whitelist <add|remove|list> <@user|id>', description: 'Manage anti-raid local bypasses.' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const sub = (args.shift() || 'status').toLowerCase();
    const protection = await getProtectionSettings(message.guild.id).catch(() => null);

    if (!protection) {
      return respond.reply(message, 'bad', 'I could not load anti-raid settings because the database is currently unreachable.');
    }

    if (sub === 'status') {
      const thresholds = protection.thresholds.antiRaid;

      return respond.reply(message, 'info', null, {
        fields: [
          { name: 'Enabled', value: String(protection.antiraid.enabled), inline: true },
          { name: 'Action', value: protection.antiraid.action, inline: true },
          { name: 'Timeout', value: `${protection.antiraid.timeoutMinutes} minute(s)`, inline: true },
          { name: 'Window', value: `${Math.round(thresholds.windowMs / 1000)}s`, inline: true },
          { name: 'Join burst', value: String(thresholds.joinBurst), inline: true },
          { name: 'Low-age burst', value: String(thresholds.lowAgeBurst), inline: true },
          { name: 'Verification channel', value: protection.antiraid.verificationChannelId ? `<#${protection.antiraid.verificationChannelId}>` : 'None' },
          { name: 'Local bypass list', value: formatWhitelist(protection.antiraid.whitelist) }
        ]
      });
    }

    if (sub === 'enable' || sub === 'on') {
      const saved = await updateProtectionSection(message.guild.id, 'antiraid', (current) => ({
        ...current,
        enabled: true
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not enable anti-raid because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', 'Anti-raid is now enabled.');
    }

    if (sub === 'disable' || sub === 'off') {
      const saved = await updateProtectionSection(message.guild.id, 'antiraid', (current) => ({
        ...current,
        enabled: false
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not disable anti-raid because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', 'Anti-raid is now disabled.');
    }

    if (sub === 'action') {
      const action = (args.shift() || '').toLowerCase();
      const timeoutMinutes = Number(args.shift() || protection.antiraid.timeoutMinutes);

      if (!ACTIONS.has(action)) {
        return respond.reply(message, 'info', 'Usage: `antiraid action <alert|timeout|kick|jail|lock> [timeoutMinutes]`.');
      }

      const saved = await updateProtectionSection(message.guild.id, 'antiraid', (current) => ({
        ...current,
        action,
        timeoutMinutes: Number.isFinite(timeoutMinutes) && timeoutMinutes > 0
          ? Math.min(720, Math.max(1, Math.round(timeoutMinutes)))
          : protection.antiraid.timeoutMinutes
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save anti-raid action because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `Anti-raid action set to **${action}**.`);
    }

    if (sub === 'channel') {
      const channelId = parseChannelId(args.shift());
      if (!channelId) {
        return respond.reply(message, 'info', 'Usage: `antiraid channel <#channel|channelId>`.');
      }

      const channel = message.guild.channels.cache.get(channelId) || await message.guild.channels.fetch(channelId).catch(() => null);
      if (!channel?.isTextBased?.()) {
        return respond.reply(message, 'bad', 'I could not find that text channel.');
      }

      const saved = await updateProtectionSection(message.guild.id, 'antiraid', (current) => ({
        ...current,
        verificationChannelId: channel.id
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save the anti-raid channel because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `Anti-raid verification channel set to ${channel}.`);
    }

    if (sub === 'threshold') {
      const path = args.shift();
      const value = Number(args.shift());

      if (!['joinBurst', 'lowAccountAgeDays', 'lowAgeBurst', 'quarantineConfidence', 'lockdownConfidence', 'windowMs'].includes(path) || !Number.isFinite(value) || value < 0) {
        return respond.reply(message, 'info', 'Usage: `antiraid threshold <joinBurst|lowAccountAgeDays|lowAgeBurst|quarantineConfidence|lockdownConfidence|windowMs> <value>`.');
      }

      const thresholds = {
        ...protection.thresholds,
        antiRaid: {
          ...protection.thresholds.antiRaid,
          [path]: path === 'windowMs'
            ? Math.max(5000, Math.round(value))
            : Math.round(value)
        }
      };

      const saved = await updateProtectionThresholds(message.guild.id, () => thresholds).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save anti-raid thresholds because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `Anti-raid threshold \`${path}\` is now \`${thresholds.antiRaid[path]}\`.`);
    }

    if (sub === 'whitelist' || sub === 'wl') {
      const action = (args.shift() || 'list').toLowerCase();
      if (action === 'list') {
        return respond.reply(message, 'info', null, {
          title: 'Anti-raid local bypass list',
          description: formatWhitelist(protection.antiraid.whitelist)
        });
      }

      const id = extractId(args.shift());
      if (!id || !['add', 'remove'].includes(action)) {
        return respond.reply(message, 'info', 'Usage: `antiraid whitelist <add|remove|list> <@user|id>`.');
      }

      const saved = await updateProtectionSection(message.guild.id, 'antiraid', (current) => {
        const next = new Set(Array.isArray(current.whitelist) ? current.whitelist : []);
        if (action === 'add') next.add(id);
        if (action === 'remove') next.delete(id);
        return {
          ...current,
          whitelist: [...next]
        };
      }).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save the anti-raid whitelist because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `${action === 'add' ? 'Added' : 'Removed'} <@${id}> ${action === 'add' ? 'to' : 'from'} the anti-raid local bypass list.`);
    }

    return respond.reply(message, 'info', 'Usage: `antiraid <status|enable|disable|action|threshold|channel|whitelist>`.');
  }
};
