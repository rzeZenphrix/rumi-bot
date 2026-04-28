const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const {
  getProtectionSettings,
  updateProtectionSection,
  updateProtectionThresholds
} = require('../../systems/security/protectionConfig');

const PUNISHMENTS = new Set(['strip', 'kick', 'ban', 'timeout']);
const EVENTS = new Set(['channelDelete', 'roleDelete', 'roleUpdate', 'channelUpdate', 'banAdd', 'webhookCreate']);

function formatWhitelist(ids = []) {
  return ids.length ? ids.map((id) => `<@${id}>`).join(', ') : 'None';
}

module.exports = {
  name: 'antinuke',
  aliases: ['an', 'antin', 'nukeguard'],
  category: 'security',
  description: 'Configure anti-nuke status, punishment, thresholds, and bypasses.',
  usage: 'antinuke',
  examples: [
    'antinuke enable',
    'antinuke punishment strip',
    'antinuke threshold channelDelete 3 30',
    'antinuke whitelist add @admin',
    'antinuke whitelist list'
  ],
  subcommands: [
    { name: 'status', usage: 'antinuke status', description: 'Show anti-nuke state, thresholds, and local bypasses.' },
    { name: 'enable', aliases: ['on'], usage: 'antinuke enable', description: 'Enable anti-nuke protection.' },
    { name: 'disable', aliases: ['off'], usage: 'antinuke disable', description: 'Disable anti-nuke protection.' },
    { name: 'punishment', usage: 'antinuke punishment <strip|kick|ban|timeout>', description: 'Set the anti-nuke punishment.' },
    { name: 'threshold', usage: 'antinuke threshold <channelDelete|roleDelete|roleUpdate|channelUpdate|banAdd|webhookCreate> <count> [windowSeconds]', description: 'Set an anti-nuke threshold.' },
    { name: 'whitelist', aliases: ['wl'], usage: 'antinuke whitelist <add|remove|list> <@user|id>', description: 'Manage anti-nuke local bypasses.' }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const sub = (args.shift() || 'status').toLowerCase();
    const protection = await getProtectionSettings(message.guild.id).catch(() => null);

    if (!protection) {
      return respond.reply(message, 'bad', 'I could not load anti-nuke settings because the database is currently unreachable.');
    }

    if (sub === 'status') {
      const thresholds = protection.thresholds.antiNuke;

      return respond.reply(message, 'info', null, {
        fields: [
          { name: 'Enabled', value: String(protection.antinuke.enabled), inline: true },
          { name: 'Punishment', value: protection.antinuke.punishment, inline: true },
          { name: 'Window', value: `${Math.round((thresholds.windowMs || 30000) / 1000)}s`, inline: true },
          {
            name: 'Thresholds',
            value: Object.entries(thresholds)
              .filter(([key]) => key !== 'windowMs')
              .map(([key, value]) => `**${key}:** ${value}`)
              .join('\n') || 'None'
          },
          {
            name: 'Local bypass list',
            value: formatWhitelist(protection.antinuke.whitelist)
          }
        ]
      });
    }

    if (sub === 'enable' || sub === 'on') {
      const saved = await updateProtectionSection(message.guild.id, 'antinuke', (current) => ({
        ...current,
        enabled: true
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not enable anti-nuke because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', 'Anti-nuke is now enabled.');
    }

    if (sub === 'disable' || sub === 'off') {
      const saved = await updateProtectionSection(message.guild.id, 'antinuke', (current) => ({
        ...current,
        enabled: false
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not disable anti-nuke because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', 'Anti-nuke is now disabled.');
    }

    if (sub === 'punishment') {
      const punishment = (args.shift() || '').toLowerCase();
      if (!PUNISHMENTS.has(punishment)) {
        return respond.reply(message, 'info', 'Usage: `antinuke punishment <strip|kick|ban|timeout>`.');
      }

      const saved = await updateProtectionSection(message.guild.id, 'antinuke', (current) => ({
        ...current,
        punishment
      })).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save anti-nuke punishment because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `Anti-nuke punishment set to **${punishment}**.`);
    }

    if (sub === 'threshold') {
      const eventType = args.shift();
      const count = Number(args.shift());
      const windowSeconds = Number(args.shift() || 30);

      if (!EVENTS.has(eventType) || !Number.isFinite(count) || count < 1) {
        return respond.reply(message, 'info', 'Usage: `antinuke threshold <channelDelete|roleDelete|roleUpdate|channelUpdate|banAdd|webhookCreate> <count> [windowSeconds]`.');
      }

      const thresholds = {
        ...protection.thresholds,
        antiNuke: {
          ...protection.thresholds.antiNuke,
          [eventType]: Math.max(1, Math.round(count)),
          windowMs: Math.max(5000, Math.round(windowSeconds * 1000))
        }
      };

      const saved = await updateProtectionThresholds(message.guild.id, () => thresholds).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save anti-nuke thresholds because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `Threshold set: **${eventType}** = **${count}** in **${windowSeconds}s**.`);
    }

    if (sub === 'whitelist' || sub === 'wl') {
      const action = (args.shift() || 'list').toLowerCase();

      if (action === 'list') {
        return respond.reply(message, 'info', null, {
          title: 'Anti-nuke local bypass list',
          description: formatWhitelist(protection.antinuke.whitelist)
        });
      }

      const id = extractId(args.shift());
      if (!id || !['add', 'remove'].includes(action)) {
        return respond.reply(message, 'info', 'Usage: `antinuke whitelist <add|remove|list> <@user|id>`.');
      }

      const saved = await updateProtectionSection(message.guild.id, 'antinuke', (current) => {
        const next = new Set(Array.isArray(current.whitelist) ? current.whitelist : []);
        if (action === 'add') next.add(id);
        if (action === 'remove') next.delete(id);
        return {
          ...current,
          whitelist: [...next]
        };
      }).catch(() => null);

      if (!saved) {
        return respond.reply(message, 'bad', 'I could not save the anti-nuke whitelist because the database is currently unreachable.');
      }

      return respond.reply(message, 'good', `${action === 'add' ? 'Added' : 'Removed'} <@${id}> ${action === 'add' ? 'to' : 'from'} the anti-nuke local bypass list.`);
    }

    return respond.reply(message, 'info', 'Usage: `antinuke <status|enable|disable|punishment|threshold|whitelist>`.');
  }
};
