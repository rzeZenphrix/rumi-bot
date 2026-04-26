const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const store = require('../../utils/simpleStore');

module.exports = {
  name: 'nsfw',
  aliases: ['nsfwsettings'],
  category: 'config',
  description: 'Enable or disable NSFW responses and NSFW-tagged commands for this server.',
  usage: 'nsfw <toggle|status> [on|off]',
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const action = String(args.shift() || 'status').toLowerCase();
    if (action === 'status') {
      const enabled = await store.getGuild(message.guild.id, 'settings', 'nsfwEnabled', false);
      return respond.reply(message, 'info', `NSFW responses are currently **${enabled ? 'enabled' : 'disabled'}** for this server.`);
    }
    if (action === 'toggle') {
      const raw = String(args.shift() || '').toLowerCase();
      if (!['on', 'off', 'true', 'false', 'enable', 'disable', 'enabled', 'disabled'].includes(raw)) {
        return respond.reply(message, 'info', 'Use `nsfw toggle on` or `nsfw toggle off`.');
      }
      const enabled = ['on', 'true', 'enable', 'enabled'].includes(raw);
      await store.setGuild(message.guild.id, 'settings', 'nsfwEnabled', enabled);
      return respond.reply(message, 'good', `NSFW responses are now **${enabled ? 'enabled' : 'disabled'}** for this server.`);
    }
    return respond.reply(message, 'info', 'Use `nsfw status` or `nsfw toggle <on|off>`.');
  }
};
