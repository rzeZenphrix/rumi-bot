const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { getGuildLevels, updateGuildLevels } = require('../../systems/levels/levelStore');

function idFromMention(value) {
  return String(value || '').match(/\d{17,20}/)?.[0] || null;
}

module.exports = {
  name: 'levels',
  aliases: ['levelsetup', 'xpsetup'],
  category: 'levels',
  description: 'Configure the XP and leveling system.',
  usage: 'levels <enable|disable|settings|message|channel|multiplier|stackroles|role|roleclear|ignore|unignore|rolemultiplier>',
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const sub = (args.shift() || 'settings').toLowerCase();

    if (sub === 'enable') {
      await updateGuildLevels(message.guild.id, (config) => {
        config.enabled = true;
      });

      return respond.reply(message, 'good', 'Leveling is now enabled.');
    }

    if (sub === 'disable') {
      await updateGuildLevels(message.guild.id, (config) => {
        config.enabled = false;
      });

      return respond.reply(message, 'good', 'Leveling is now disabled.');
    }

    if (sub === 'settings') {
      const config = await getGuildLevels(message.guild.id);

      return respond.reply(message, 'info', null, {
        description: 'Leveling settings for this server.',
        fields: [
          { name: 'Enabled', value: String(config.enabled), inline: true },
          { name: 'Multiplier', value: String(config.multiplier), inline: true },
          { name: 'Stack roles', value: String(config.stackRoles), inline: true },
          { name: 'Level channel', value: config.levelChannelId ? `<#${config.levelChannelId}>` : 'Current channel', inline: true },
          { name: 'Level roles', value: Object.entries(config.levelRoles).map(([level, role]) => `Level ${level}: <@&${role}>`).join('\n') || 'None' }
        ]
      });
    }

    if (sub === 'message') {
      const text = args.join(' ').trim();

      if (!text) return respond.reply(message, 'info', 'Send a level-up message template.');

      await updateGuildLevels(message.guild.id, (config) => {
        config.levelMessage = text;
      });

      return respond.reply(message, 'good', 'Level-up message updated.');
    }

    if (sub === 'channel') {
      const channelId = idFromMention(args[0]);

      await updateGuildLevels(message.guild.id, (config) => {
        config.levelChannelId = channelId;
      });

      return respond.reply(
        message,
        'good',
        channelId ? `Level-up messages will go to <#${channelId}>.` : 'Level-up messages will use the current channel.'
      );
    }

    if (sub === 'multiplier') {
      const value = Number(args[0]);

      if (!Number.isFinite(value) || value <= 0) {
        return respond.reply(message, 'info', 'Use `levels multiplier <number>`.');
      }

      await updateGuildLevels(message.guild.id, (config) => {
        config.multiplier = value;
      });

      return respond.reply(message, 'good', `XP multiplier set to **${value}x**.`);
    }

    if (sub === 'stackroles') {
      const value = String(args[0] || '').toLowerCase();

      if (!['on', 'off', 'true', 'false'].includes(value)) {
        return respond.reply(message, 'info', 'Use `levels stackroles <on|off>`.');
      }

      await updateGuildLevels(message.guild.id, (config) => {
        config.stackRoles = ['on', 'true'].includes(value);
      });

      return respond.reply(message, 'good', `Stacked level roles are now **${['on', 'true'].includes(value) ? 'enabled' : 'disabled'}**.`);
    }

    if (sub === 'role') {
      const level = Number(args.shift());
      const roleId = idFromMention(args.shift());

      if (!Number.isInteger(level) || level <= 0 || !roleId) {
        return respond.reply(message, 'info', 'Use `levels role <level> @role`.');
      }

      await updateGuildLevels(message.guild.id, (config) => {
        config.levelRoles[level] = roleId;
      });

      return respond.reply(message, 'good', `Level **${level}** reward role set to <@&${roleId}>.`);
    }

    if (sub === 'roleclear') {
      const level = Number(args[0]);

      await updateGuildLevels(message.guild.id, (config) => {
        delete config.levelRoles[level];
      });

      return respond.reply(message, 'good', `Removed the level **${level}** reward role.`);
    }

    if (sub === 'ignore') {
      const channelId = idFromMention(args[0]);

      if (!channelId) return respond.reply(message, 'info', 'Use `levels ignore #channel`.');

      await updateGuildLevels(message.guild.id, (config) => {
        if (!config.ignoredChannels.includes(channelId)) config.ignoredChannels.push(channelId);
      });

      return respond.reply(message, 'good', `Ignored <#${channelId}> for XP.`);
    }

    if (sub === 'unignore') {
      const channelId = idFromMention(args[0]);

      await updateGuildLevels(message.guild.id, (config) => {
        config.ignoredChannels = config.ignoredChannels.filter((id) => id !== channelId);
      });

      return respond.reply(message, 'good', `Removed <#${channelId}> from XP ignores.`);
    }

    if (sub === 'rolemultiplier') {
      const roleId = idFromMention(args.shift());
      const value = Number(args.shift());

      if (!roleId || !Number.isFinite(value) || value <= 0) {
        return respond.reply(message, 'info', 'Use `levels rolemultiplier @role <number>`.');
      }

      await updateGuildLevels(message.guild.id, (config) => {
        config.roleMultipliers[roleId] = value;
      });

      return respond.reply(message, 'good', `XP multiplier for <@&${roleId}> set to **${value}x**.`);
    }

    return respond.reply(message, 'info', 'Use `levels settings` to view configuration.');
  }
};
