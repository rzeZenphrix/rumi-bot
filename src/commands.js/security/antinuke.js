const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { extractId } = require('../../utils/resolveUser');
const { getConfig, updateConfig } = require('../../systems/antinuke/simpleStore');

module.exports = {
  name: 'antinuke',
  aliases: ['an', 'antin', 'nukeguard'],
  category: 'security',
  description: 'Configure anti-nuke status, punishment, thresholds, and whitelist.',
  usage: 'antinuke <status|enable|disable|punishment|threshold|whitelist>',
  examples: ['antinuke enable', 'antinuke punishment strip', 'antinuke threshold channelDelete 3 30', 'antinuke whitelist add @admin', 'antinuke whitelist list'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const sub = (args.shift() || 'status').toLowerCase();

    if (sub === 'status') {
      const c = getConfig(message.guild.id);
      return respond.reply(message, 'info', null, {
        title: 'Anti-nuke status',
        fields: [
          { name: 'Enabled', value: String(c.enabled), inline: true },
          { name: 'Punishment', value: c.punishment, inline: true },
          { name: 'Window', value: `${Math.round(c.thresholds.windowMs / 1000)}s`, inline: true },
          { name: 'Thresholds', value: Object.entries(c.thresholds).filter(([k]) => k !== 'windowMs').map(([k, v]) => `**${k}:** ${v}`).join('\n') || 'None' },
          { name: 'Whitelist', value: c.whitelist.map((id) => `<@${id}>`).join(', ') || 'None' }
        ]
      });
    }

    if (sub === 'enable' || sub === 'on') {
      updateConfig(message.guild.id, (c) => { c.enabled = true; });
      return respond.reply(message, 'good', 'Anti-nuke is now enabled.');
    }

    if (sub === 'disable' || sub === 'off') {
      updateConfig(message.guild.id, (c) => { c.enabled = false; });
      return respond.reply(message, 'good', 'Anti-nuke is now disabled.');
    }

    if (sub === 'punishment') {
      const punishment = (args.shift() || '').toLowerCase();
      if (!['strip', 'kick', 'ban', 'timeout'].includes(punishment)) return respond.reply(message, 'info', 'Usage: `antinuke punishment <strip|kick|ban|timeout>`.');
      updateConfig(message.guild.id, (c) => { c.punishment = punishment; });
      return respond.reply(message, 'good', `Anti-nuke punishment set to **${punishment}**.`);
    }

    if (sub === 'threshold') {
      const eventType = args.shift();
      const count = Number(args.shift());
      const windowSeconds = Number(args.shift() || 30);
      if (!eventType || !Number.isFinite(count) || count < 1) return respond.reply(message, 'info', 'Usage: `antinuke threshold <channelDelete|roleDelete|banAdd|webhookCreate> <count> [windowSeconds]`.');
      updateConfig(message.guild.id, (c) => {
        c.thresholds[eventType] = Math.max(1, Math.round(count));
        c.thresholds.windowMs = Math.max(5000, Math.round(windowSeconds * 1000));
      });
      return respond.reply(message, 'good', `Threshold set: **${eventType}** = **${count}** in **${windowSeconds}s**.`);
    }

    if (sub === 'whitelist' || sub === 'wl') {
      const action = (args.shift() || 'list').toLowerCase();
      if (action === 'list') {
        const c = getConfig(message.guild.id);
        return respond.reply(message, 'info', null, { title: 'Anti-nuke whitelist', description: c.whitelist.map((id) => `<@${id}>`).join('\n') || 'No whitelisted users.' });
      }
      const id = extractId(args.shift());
      if (!id || !['add', 'remove'].includes(action)) return respond.reply(message, 'info', 'Usage: `antinuke whitelist <add|remove|list> <@user|id>`.');
      updateConfig(message.guild.id, (c) => {
        if (action === 'add' && !c.whitelist.includes(id)) c.whitelist.push(id);
        if (action === 'remove') c.whitelist = c.whitelist.filter((x) => x !== id);
      });
      return respond.reply(message, 'good', `${action === 'add' ? 'Added' : 'Removed'} <@${id}> ${action === 'add' ? 'to' : 'from'} the anti-nuke whitelist.`);
    }

    return respond.reply(message, 'info', 'Usage: `antinuke <status|enable|disable|punishment|threshold|whitelist>`.');
  }
};
