const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const emojis = require('../../utils/botEmojis');
const {
  getSecuritySettings,
  setSecurityFlag
} = require('../../systems/security/securitySettings');

const FLAGS = {
  all: ['enabled'],
  antinuke: ['antinuke'],
  antiraid: ['antiraid'],
  automod: ['automod'],
  verification: ['verification'],
  logging: ['logging']
};

function statusLine(label, value) {
  return `${value ? emojis.good : emojis.bad} **${label}:** \`${value ? 'on' : 'off'}\``;
}

function buildStatus(config) {
  return [
    statusLine('Security system', config.enabled),
    statusLine('Anti-nuke', config.antinuke),
    statusLine('Anti-raid', config.antiraid),
    statusLine('Automod', config.automod),
    statusLine('Verification', config.verification),
    statusLine('Logging', config.logging),
    '',
    config.updatedAt
      ? `Last updated <t:${Math.floor(new Date(config.updatedAt).getTime() / 1000)}:R>`
      : 'No recent security changes saved.'
  ].join('\n');
}

module.exports = {
  name: 'security',
  aliases: ['protect', 'protection'],
  category: 'security',
  description: 'View or update this server’s security protection settings.',
  usage: 'security <status|on|off|antinuke|antiraid|automod|verification|logging> [on|off]',
  examples: [
    'security status',
    'security on',
    'security off',
    'security antinuke on',
    'security antiraid off',
    'security verification on'
  ],
  guildOnly: true,
  slash: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [PermissionFlagsBits.EmbedLinks],
  subcommands: [
    {
      name: 'status',
      description: 'Show current security settings.',
      usage: 'security status',
      examples: ['security status']
    },
    {
      name: 'on',
      aliases: ['enable'],
      description: 'Enable the main security system.',
      usage: 'security on',
      examples: ['security on']
    },
    {
      name: 'off',
      aliases: ['disable'],
      description: 'Disable the main security system.',
      usage: 'security off',
      examples: ['security off']
    },
    {
      name: 'antinuke',
      description: 'Toggle anti-nuke protection.',
      usage: 'security antinuke <on|off>',
      examples: ['security antinuke on']
    },
    {
      name: 'antiraid',
      description: 'Toggle anti-raid protection.',
      usage: 'security antiraid <on|off>',
      examples: ['security antiraid on']
    },
    {
      name: 'automod',
      description: 'Toggle automod protection.',
      usage: 'security automod <on|off>',
      examples: ['security automod on']
    },
    {
      name: 'verification',
      description: 'Toggle verification protection.',
      usage: 'security verification <on|off>',
      examples: ['security verification on']
    },
    {
      name: 'logging',
      description: 'Toggle security logging.',
      usage: 'security logging <on|off>',
      examples: ['security logging on']
    }
  ],

  async execute({ message, args, prefix }) {
    const action = String(args.shift() || 'status').toLowerCase();
    const commandPrefix = prefix || message.prefix || ',';

    if (action === 'status' || action === 'view') {
      const config = await getSecuritySettings(message.guild.id).catch(() => null);

      if (!config) {
        return respond.reply(message, 'bad', 'I could not load the security settings right now.', {
          mentionUser: false
        });
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Security settings',
        allowTitle: true,
        description: buildStatus(config)
      });
    }

    if (action === 'on' || action === 'enable') {
      const config = await setSecurityFlag(message.guild.id, 'enabled', true, message.author.id);
      return respond.reply(message, 'good', 'Security system is now **on**.', {
        mentionUser: false,
        title: 'Security enabled',
        allowTitle: true,
        description: buildStatus(config)
      });
    }

    if (action === 'off' || action === 'disable') {
      const config = await setSecurityFlag(message.guild.id, 'enabled', false, message.author.id);
      return respond.reply(message, 'good', 'Security system is now **off**.', {
        mentionUser: false,
        title: 'Security disabled',
        allowTitle: true,
        description: buildStatus(config)
      });
    }

    if (Object.prototype.hasOwnProperty.call(FLAGS, action)) {
      const desired = String(args.shift() || '').toLowerCase();

      if (!['on', 'enable', 'off', 'disable'].includes(desired)) {
        return respond.reply(
          message,
          'info',
          `Use \`${commandPrefix}security ${action} <on|off>\`.`,
          { mentionUser: false }
        );
      }

      const value = desired === 'on' || desired === 'enable';
      const key = FLAGS[action][0];

      const config = await setSecurityFlag(message.guild.id, key, value, message.author.id);

      return respond.reply(
        message,
        value ? 'good' : 'alert',
        `**${action}** is now **${value ? 'on' : 'off'}**.`,
        {
          mentionUser: false,
          title: 'Security updated',
          allowTitle: true,
          description: buildStatus(config)
        }
      );
    }

    return respond.reply(
      message,
      'info',
      `Use \`${commandPrefix}security <status|on|off|antinuke|antiraid|automod|verification|logging>\`.`,
      { mentionUser: false }
    );
  }
};
