const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  disabledMessage,
  isCustomizationEnabled,
  getGuildCustomization,
  setGuildCustomization,
  resetGuildCustomization,
  normalizeHex,
  appendSupportInvite
} = require('../../systems/customization/customizationStore');
const { applyGuildProfile } = require('../../systems/customization/profileManager');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

const TYPES = new Set(['info', 'good', 'bad', 'alert', 'list']);

function normalizeEmojiInput(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  if (['off', 'none', 'disable'].includes(text.toLowerCase())) return '';
  return text.slice(0, 64);
}

function cleanUrl(value) {
  const text = String(value || '').trim();
  if (!text || ['reset', 'default', 'none'].includes(text.toLowerCase())) return null;

  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

async function safeApplyProfile(guild) {
  try {
    return await applyGuildProfile(guild, {
      config: getGuildCustomization(guild.id)
    });
  } catch (error) {
    return {
      ok: false,
      reason: error?.message || 'Unknown Discord profile update error.'
    };
  }
}

module.exports = {
  name: 'customize',
  aliases: ['custom'],
  category: 'config',
  description: 'Customize Rumi replies, profile styling, and webhook response mode for this server.',
  usage: 'customize <view|mode|color|emoji|profile|reset> ...',
  examples: [
    'customize view',
    'customize mode webhook',
    'customize color info #f6c8d8',
    'customize emoji good <:heart:123>',
    'customize profile bio cutest helper in town',
    'customize profile nickname Rumi'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const sub = (args.shift() || 'view').toLowerCase();

    if (!isCustomizationEnabled()) {
      return respond.reply(message, 'alert', disabledMessage(), { useWebhook: false });
    }

    if (sub === 'view') {
      const config = getGuildCustomization(message.guild.id);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        fields: [
          { name: 'Reply mode', value: config.replyMode || 'bot', inline: true },
          { name: 'Info color', value: config.replyColors.info || 'default', inline: true },
          { name: 'Info emoji', value: config.replyEmojis.info || 'disabled', inline: true },
          { name: 'Custom nickname', value: config.botProfile.nickname || message.guild.members.me?.nickname || 'Default', inline: true },
          { name: 'Custom avatar', value: config.botProfile.avatarUrl ? '[Open avatar](' + config.botProfile.avatarUrl + ')' : 'Default', inline: true },
          { name: 'Custom banner', value: config.botProfile.bannerUrl ? '[Open banner](' + config.botProfile.bannerUrl + ')' : 'Default', inline: true },
          { name: 'Custom bio', value: config.botProfile.bio || 'Default' }
        ]
      });
    }

    if (sub === 'mode') {
      const mode = (args.shift() || '').toLowerCase();
      if (!['bot', 'webhook'].includes(mode)) {
        return respond.reply(message, 'info', 'Use `customize mode <bot|webhook>`.');
      }

      await setGuildCustomization(message.guild.id, (config) => {
        config.replyMode = mode;
      });

      return respond.reply(message, 'good', `Rumi reply mode is now set to **${mode}**.`);
    }

    if (sub === 'color') {
      const type = (args.shift() || '').toLowerCase();
      const hex = normalizeHex(args.shift());
      if (!TYPES.has(type) || !hex) {
        return respond.reply(message, 'info', 'Use `customize color <info|good|bad|alert|list> <hex>`.');
      }

      await setGuildCustomization(message.guild.id, (config) => {
        config.replyColors[type] = hex;
      });

      return respond.reply(message, 'good', `Updated **${type}** reply color to \`${hex}\`.`);
    }

    if (sub === 'emoji') {
      const type = (args.shift() || '').toLowerCase();
      const emoji = normalizeEmojiInput(args.join(' '));
      if (!TYPES.has(type) || emoji === null) {
        return respond.reply(message, 'info', 'Use `customize emoji <info|good|bad|alert|list> <emoji|off>`.');
      }

      await setGuildCustomization(message.guild.id, (config) => {
        config.replyEmojis[type] = emoji;
      });

      return respond.reply(message, 'good', emoji
        ? `Updated **${type}** reply emoji to ${emoji}.`
        : `Disabled the **${type}** reply emoji.`);
    }

    if (sub === 'profile') {
      const field = (args.shift() || '').toLowerCase();
      const raw = args.join(' ').trim();

      if (!['nickname', 'avatar', 'banner', 'bio'].includes(field)) {
        return respond.reply(message, 'info', 'Use `customize profile <nickname|avatar|banner|bio> <value|reset>`.');
      }

      const resetProfile = ['reset', 'default', 'none'].includes(raw.toLowerCase());
      if ((field === 'avatar' || field === 'banner') && !resetProfile && !cleanUrl(raw)) {
        return respond.reply(message, 'bad', `I need a valid image URL for profile ${field}.`);
      }

      const premiumAccess = await getPremiumAccessForMessage(message).catch(() => null);

      await setGuildCustomization(message.guild.id, (config) => {
        if (field === 'nickname') {
          config.botProfile.nickname = resetProfile ? null : raw.slice(0, 32);
        }

        if (field === 'avatar') {
          config.botProfile.avatarUrl = resetProfile ? null : cleanUrl(raw);
        }

        if (field === 'banner') {
          config.botProfile.bannerUrl = resetProfile ? null : cleanUrl(raw);
        }

        if (field === 'bio') {
          config.botProfile.bio = resetProfile
            ? null
            : premiumAccess?.hasServerPremiumBase
              ? raw.slice(0, 190)
              : appendSupportInvite(raw);
        }
      });

      const result = await safeApplyProfile(message.guild);

      if (field === 'nickname' && !message.guild.members.me?.permissions.has(PermissionFlagsBits.ChangeNickname)) {
        return respond.reply(message, 'alert', 'I saved the nickname setting, but I still need Change Nickname to apply it here.');
      }

      if (!result.ok) {
        return respond.reply(message, 'alert', `I saved that customization, but I could not apply it yet: ${result.reason}`);
      }

      const skippedField = (result.skipped || []).find((entry) => entry.field === field);
      if (skippedField) {
        return respond.reply(message, 'alert', `I saved that customization, but it is not fully applicable in Discord yet: ${skippedField.reason}`);
      }

      return respond.reply(message, 'good', `Updated Rumi profile **${field}** for this server.`);
    }

    if (sub === 'reset') {
      const section = (args.shift() || 'all').toLowerCase();
      if (!['all', 'theme', 'profile', 'webhooks'].includes(section)) {
        return respond.reply(message, 'info', 'Use `customize reset <all|theme|profile|webhooks>`.');
      }

      resetGuildCustomization(message.guild.id, section);

      if (section === 'all' || section === 'profile') {
        const result = await safeApplyProfile(message.guild);

        if (!result.ok) {
          return respond.reply(message, 'alert', `I reset the saved profile settings, but I could not fully apply them yet: ${result.reason}`);
        }
      }

      return respond.reply(message, 'good', `Reset customization section **${section}**.`);
    }

    return respond.reply(message, 'info', 'Use `customize view`, `customize mode`, `customize color`, `customize emoji`, `customize profile`, or `customize reset`.');
  }
};
