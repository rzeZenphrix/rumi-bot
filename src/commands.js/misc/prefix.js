const { PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const {
  DEFAULT_PREFIX,
  getPrefixSettings,
  setCustomPrefix,
  setDefaultPrefixEnabled
} = require('../../systems/prefix/prefixStore');

function embed(text, color = 0x5865f2) {
  return new EmbedBuilder()
    .setColor(color)
    .setDescription(text);
}

module.exports = {
  name: 'prefix',
  aliases: ['setprefix'],
  category: 'core',
  description: 'View or update this server’s prefix settings.',
  usage: '<set|default|status|reset>',
  examples: [
    'prefix status',
    'prefix set !',
    'prefix default off',
    'prefix default on'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const sub = (args.shift() || 'status').toLowerCase();

    if (sub === 'status') {
      const settings = await getPrefixSettings(message.guild.id);

      return message.channel.send({
        embeds: [
          embed(
            [
              `Custom prefix: ${settings.prefix ? `\`${settings.prefix}\`` : '`not set`'}`,
              `Default prefix \`${DEFAULT_PREFIX}\`: **${settings.defaultPrefixEnabled ? 'enabled' : 'disabled'}**`
            ].join('\n')
          )
        ],
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'set') {
      const prefix = args[0];

      if (!prefix || prefix.length > 5) {
        return message.channel.send({
          embeds: [embed('Use a prefix between 1 and 5 characters.', 0xed4245)],
          allowedMentions: { parse: [] }
        });
      }

      await setCustomPrefix(message.guild.id, prefix);

      return message.channel.send({
        embeds: [embed(`Custom prefix set to \`${prefix}\`.`, 0x57f287)],
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'default') {
      const mode = String(args[0] || '').toLowerCase();

      if (!['on', 'off', 'enable', 'disable', 'enabled', 'disabled'].includes(mode)) {
        return message.channel.send({
          embeds: [embed('Usage: `prefix default <on|off>`.', 0xed4245)],
          allowedMentions: { parse: [] }
        });
      }

      const enabled = ['on', 'enable', 'enabled'].includes(mode);

      await setDefaultPrefixEnabled(message.guild.id, enabled);

      return message.channel.send({
        embeds: [
          embed(
            `Default prefix \`${DEFAULT_PREFIX}\` is now **${enabled ? 'enabled' : 'disabled'}**.`,
            0x57f287
          )
        ],
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'reset') {
      await setCustomPrefix(message.guild.id, null);
      await setDefaultPrefixEnabled(message.guild.id, true);

      return message.channel.send({
        embeds: [embed('Prefix settings reset.', 0x57f287)],
        allowedMentions: { parse: [] }
      });
    }

    return message.channel.send({
      embeds: [embed('Usage: `prefix <status|set|default|reset>`.', 0x5865f2)],
      allowedMentions: { parse: [] }
    });
  }
};