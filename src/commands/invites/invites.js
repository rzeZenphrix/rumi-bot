const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { resolveUser, extractId } = require('../../utils/resolveUser');
const inviteTracker = require('../../systems/invites/inviteTracker');

function canManage(message) {
  return message.member?.permissions?.has?.(PermissionFlagsBits.ManageGuild);
}

function periodArg(value) {
  return inviteTracker.normalizePeriod(value || 'alltime');
}

async function channelIdFromArg(message, raw) {
  if (!raw) return null;
  if (/^off|none|disable|disabled$/i.test(raw)) return 'off';

  const id = String(raw).match(/^<#(\d{17,20})>$/)?.[1] || extractId(raw);
  if (!id) return null;

  const channel = await message.guild.channels.fetch(id).catch(() => null);
  return channel?.id || null;
}

module.exports = {
  name: 'invites',
  aliases: ['invitecount'],
  category: 'invites',
  description: 'View invite stats, leaderboard, and invite tracking settings.',
  usage: 'invites [@user|top|settings|enable|disable|log|refresh]',
  examples: [
    'invites',
    'invites @user',
    'invites top weekly',
    'invites settings',
    'invites log #join-logs',
    'invites refresh'
  ],
  guildOnly: true,
  botPermissions: [PermissionFlagsBits.ManageGuild],

  async execute({ client, message, args }) {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'enable' || sub === 'disable') {
      if (!canManage(message)) {
        return respond.reply(message, 'bad', 'You need Manage Server to change invite tracking settings.', {
          allowedMentions: { parse: [] }
        });
      }

      const settings = await inviteTracker.updateSettings(message.guild.id, {
        enabled: sub === 'enable'
      });

      return respond.reply(message, 'good', `Invite tracking is now **${settings.enabled ? 'enabled' : 'disabled'}**.`, {
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'settings' || sub === 'config') {
      const settings = await inviteTracker.getSettings(message.guild.id);

      return respond.reply(
        message,
        'info',
        [
          `Invite tracking: **${settings.enabled ? 'enabled' : 'disabled'}**`,
          `Log channel: ${settings.log_channel_id ? `<#${settings.log_channel_id}>` : 'not set'}`,
          '',
          'Use `invites enable`, `invites disable`, `invites log #channel`, or `invites refresh`.'
        ].join('\n'),
        { allowedMentions: { parse: [] } }
      );
    }

    if (sub === 'log') {
      if (!canManage(message)) {
        return respond.reply(message, 'bad', 'You need Manage Server to change invite tracking settings.', {
          allowedMentions: { parse: [] }
        });
      }

      const raw = args[1];
      const id = await channelIdFromArg(message, raw);

      if (!id) {
        return respond.reply(message, 'info', 'Usage: `invites log <#channel|off>`.', {
          allowedMentions: { parse: [] }
        });
      }

      const settings = await inviteTracker.updateSettings(message.guild.id, {
        log_channel_id: id === 'off' ? null : id
      });

      return respond.reply(
        message,
        'good',
        settings.log_channel_id
          ? `Invite join logs will go to <#${settings.log_channel_id}>.`
          : 'Invite join logs are now disabled.',
        { allowedMentions: { parse: [] } }
      );
    }

    if (sub === 'refresh' || sub === 'sync') {
      if (!canManage(message)) {
        return respond.reply(message, 'bad', 'You need Manage Server to refresh invite tracking.', {
          allowedMentions: { parse: [] }
        });
      }

      const snapshot = await inviteTracker.initGuild(message.guild);

      return respond.reply(message, 'good', `Invite cache refreshed. Stored **${snapshot.invites.size}** active invite(s).`, {
        allowedMentions: { parse: [] }
      });
    }

    if (sub === 'top' || sub === 'leaderboard' || sub === 'lb') {
      const period = periodArg(args[1]);
      const rows = await inviteTracker.getLeaderboard(message.guild.id, period, 10);

      const lines = rows.map((row, index) => {
        return `\`${index + 1}.\` <@${row.inviter_id}> — **${row.total}** joins, **${row.active}** active`;
      });

      return respond.reply(
        message,
        'info',
        lines.length
          ? `Invite leaderboard — **${period}**\n${lines.join('\n')}`
          : `No invite joins found for **${period}**.`,
        { allowedMentions: { parse: [] } }
      );
    }

    let user = message.author;

    if (args[0]) {
      user = await resolveUser(client, args[0]).catch(() => null);
      if (!user) {
        return respond.reply(message, 'bad', 'I could not find that user.', {
          allowedMentions: { parse: [] }
        });
      }
    }

    const stats = await inviteTracker.getUserInviteStats(message.guild.id, user.id, 'alltime');

    return respond.reply(
      message,
      'info',
      [
        `Invite stats for **${user.tag || user.username}**`,
        `Total joins: **${stats?.total || 0}**`,
        `Active joins: **${stats?.active || 0}**`,
        `Left: **${stats?.left_count || 0}**`,
        `Invite joins: **${stats?.invite_joins || 0}**`
      ].join('\n'),
      { allowedMentions: { parse: [] } }
    );
  }
};
