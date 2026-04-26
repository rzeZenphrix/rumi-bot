const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  getGuildCustomization,
  updateGuildCustomization,
  resetGuildCustomization,
  normalizeHex
} = require('../../systems/customization/customizationStore');

const REPLY_TYPES = ['info', 'good', 'bad', 'alert', 'list'];

function getAttachmentUrl(message) {
  return message.attachments?.first?.()?.url || null;
}

function isUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function validReplyType(value) {
  return REPLY_TYPES.includes(String(value || '').toLowerCase());
}

module.exports = {
  name: 'customize',
  aliases: [
    'custom'
  ],
  category: 'config',
  description: 'Customize my replies and server-specific bot branding for this server.',
  usage: 'customize view|mode|name|avatar|banner|bio|replycolor|replyemoji|reset|test',
  examples: [
    'customize view',
    'customize mode webhook',
    'customize name Rumi',
    'customize avatar url',
    'customize banner url',
    'customize bio API coded from https://rumi.bot/',
    'customize replycolor good #57f287',
    'customize replyemoji good 👍',
    'customize reset all',
    'customize test'
  ],
  subcommands: [
    {
      name: 'view',
      description: 'Shows this server’s customization.',
      usage: 'view'
    },
    {
      name: 'mode',
      description: 'Changes reply mode. Bot mode is normal. Webhook mode allows server-specific name/avatar.',
      usage: 'mode bot|webhook'
    },
    {
      name: 'name',
      description: 'Sets my server-specific webhook reply name.',
      usage: 'name name'
    },
    {
      name: 'avatar',
      description: 'Sets my server-specific webhook reply avatar.',
      usage: 'avatar url|attachment'
    },
    {
      name: 'banner',
      description: 'Saves my server-specific display banner URL.',
      usage: 'banner url|attachment'
    },
    {
      name: 'bio',
      description: 'Saves my server-specific bio text.',
      usage: 'bio text'
    },
    {
      name: 'replycolor',
      description: 'Sets a reply embed color.',
      usage: 'replycolor info|good|bad|alert|list|all #hex'
    },
    {
      name: 'replyemoji',
      description: 'Sets a reply emoji.',
      usage: 'replyemoji info|good|bad|alert|list|all emoji'
    },
    {
      name: 'reset',
      description: 'Resets this server’s customization.',
      usage: 'reset theme|profile|webhooks|all'
    },
    {
      name: 'test',
      description: 'Tests the current reply theme.',
      usage: 'test'
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  botPermissions: [
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ManageWebhooks
  ],

  async execute({ message, args }) {
    const sub = (args.shift() || 'view').toLowerCase();

    if (sub === 'view') {
      const config = getGuildCustomization(message.guild.id);

      return respond.reply(message, 'info', null, {
        description: 'Server customization settings.',
        mentionUser: false,
        fields: [
          {
            name: 'Reply mode',
            value: `\`${config.replyMode}\``,
            inline: true
          },
          {
            name: 'Profile',
            value: [
              `Name: ${config.botProfile.username || 'default bot name'}`,
              `Avatar: ${config.botProfile.avatarUrl || 'default bot avatar'}`,
              `Banner: ${config.botProfile.bannerUrl || 'not set'}`,
              `Bio: ${config.botProfile.bio || 'not set'}`
            ].join('\n').slice(0, 1024)
          },
          {
            name: 'Reply colors',
            value: Object.entries(config.replyColors)
              .map(([key, value]) => `\`${key}\` ${value}`)
              .join('\n')
              .slice(0, 1024),
            inline: true
          },
          {
            name: 'Reply emojis',
            value: Object.entries(config.replyEmojis)
              .map(([key, value]) => `\`${key}\` ${value}`)
              .join('\n')
              .slice(0, 1024),
            inline: true
          }
        ]
      });
    }

    if (sub === 'mode') {
      const mode = String(args[0] || '').toLowerCase();

      if (!['bot', 'webhook'].includes(mode)) {
        return respond.reply(
          message,
          'info',
          'Use `customize mode bot` or `customize mode webhook`.'
        );
      }

      updateGuildCustomization(message.guild.id, (config) => {
        config.replyMode = mode;
      });

      return respond.reply(
        message,
        'good',
        mode === 'webhook'
          ? 'Webhook reply mode enabled. I can now use this server’s custom name and avatar in my replies.'
          : 'Bot reply mode enabled. I’ll reply as the normal bot account.'
      );
    }

    if (sub === 'name') {
      const name = args.join(' ').trim();

      if (!name || name.length > 80) {
        return respond.reply(message, 'info', 'Send a name between 1 and 80 characters.');
      }

      updateGuildCustomization(message.guild.id, (config) => {
        config.botProfile.username = name;
      });

      return respond.reply(message, 'good', `Server reply name set to **${name}**.`);
    }

    if (sub === 'avatar') {
      const url = args[0] || getAttachmentUrl(message);

      if (!isUrl(url)) {
        return respond.reply(message, 'info', 'Send an image URL or attach an image.');
      }

      updateGuildCustomization(message.guild.id, (config) => {
        config.botProfile.avatarUrl = url;
      });

      return respond.reply(
        message,
        'good',
        'Server reply avatar saved. Use `customize mode webhook` to make replies use it.'
      );
    }

    if (sub === 'banner') {
      const url = args[0] || getAttachmentUrl(message);

      if (!isUrl(url)) {
        return respond.reply(message, 'info', 'Send an image URL or attach an image.');
      }

      updateGuildCustomization(message.guild.id, (config) => {
        config.botProfile.bannerUrl = url;
      });

      return respond.reply(
        message,
        'good',
        'Server banner saved. I’ll use it in profile-style commands and variables.'
      );
    }

    if (sub === 'bio') {
      const bio = args.join(' ').trim();

      if (!bio) {
        return respond.reply(message, 'info', 'Send the bio text you want me to save.');
      }

      updateGuildCustomization(message.guild.id, (config) => {
        config.botProfile.bio = bio.slice(0, 500);
      });

      return respond.reply(message, 'good', 'Server bio saved.');
    }

    if (sub === 'replycolor') {
      const type = String(args.shift() || '').toLowerCase();
      const color = normalizeHex(args.shift());

      if ((!validReplyType(type) && type !== 'all') || !color) {
        return respond.reply(
          message,
          'info',
          'Use `customize replycolor info|good|bad|alert|list|all #hex`.'
        );
      }

      updateGuildCustomization(message.guild.id, (config) => {
        if (type === 'all') {
          for (const key of REPLY_TYPES) {
            config.replyColors[key] = color;
          }
        } else {
          config.replyColors[type] = color;
        }
      });

      return respond.reply(message, 'good', `Reply color updated for **${type}**.`);
    }

    if (sub === 'replyemoji') {
      const type = String(args.shift() || '').toLowerCase();
      const emoji = args.join(' ').trim();

      if ((!validReplyType(type) && type !== 'all') || !emoji) {
        return respond.reply(
          message,
          'info',
          'Use `customize replyemoji info|good|bad|alert|list|all emoji`.'
        );
      }

      updateGuildCustomization(message.guild.id, (config) => {
        if (type === 'all') {
          for (const key of REPLY_TYPES) {
            config.replyEmojis[key] = emoji;
          }
        } else {
          config.replyEmojis[type] = emoji;
        }
      });

      return respond.reply(message, 'good', `Reply emoji updated for **${type}**.`);
    }

    if (sub === 'reset') {
      const section = String(args[0] || 'all').toLowerCase();

      if (!['theme', 'profile', 'webhooks', 'all'].includes(section)) {
        return respond.reply(message, 'info', 'Use `customize reset theme|profile|webhooks|all`.');
      }

      resetGuildCustomization(message.guild.id, section);

      return respond.reply(message, 'good', `Reset **${section}** customization for this server.`);
    }

    if (sub === 'test') {
      await respond.reply(message, 'info', 'Info reply test.', { mentionUser: false });
      await respond.reply(message, 'good', 'Success reply test.', { mentionUser: false });
      await respond.reply(message, 'bad', 'Error reply test.', { mentionUser: false });
      await respond.reply(message, 'alert', 'Warning reply test.', { mentionUser: false });
      await respond.reply(message, 'list', 'List reply test.', { mentionUser: false });
      return null;
    }

    return respond.reply(message, 'bad', `Unknown customize action: \`${sub}\`.`);
  }
};