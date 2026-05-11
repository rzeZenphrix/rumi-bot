const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { findMember } = require('../../utils/memberResolver');
const { extractId } = require('../../utils/resolveUser');

const ANALYTICS_NAMESPACE = 'analytics:guild';
const ANALYTICS_DAILY_NAMESPACE = 'analytics:guild:daily';
const ANALYTICS_CHANNEL_NAMESPACE = 'analytics:guild:channels';
const ANALYTICS_MEMBER_NAMESPACE = 'analytics:guild:members';

function dateKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function pickDateRange(days, offset = 0) {
  const keys = [];
  const today = new Date();
  for (let index = offset; index < offset + days; index += 1) {
    const entry = new Date(today);
    entry.setUTCDate(entry.getUTCDate() - index);
    keys.push(dateKey(entry));
  }
  return keys;
}

function sumDailyMessages(daily, days) {
  return pickDateRange(days).reduce((total, key) => {
    return total + Number((daily?.[key] || {}).messageCount || 0);
  }, 0);
}

function formatTime(value) {
  if (!value) return 'not tracked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not tracked yet';
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

async function loadAnalytics(guildId) {
  const [stats, daily, channels, members] = await Promise.all([
    db.getKv(ANALYTICS_NAMESPACE, guildId, {}),
    db.getKv(ANALYTICS_DAILY_NAMESPACE, guildId, {}),
    db.getKv(ANALYTICS_CHANNEL_NAMESPACE, guildId, {}),
    db.getKv(ANALYTICS_MEMBER_NAMESPACE, guildId, {})
  ]);

  return {
    stats: stats || {},
    daily: daily || {},
    channels: channels || {},
    members: members || {}
  };
}

async function resolveChannel(guild, input, fallbackChannel) {
  if (!input && fallbackChannel) return fallbackChannel;
  const id = String(input || '').match(/^<#(\d{17,20})>$/)?.[1] || extractId(input || '');
  if (id) return guild.channels.cache.get(id) || guild.channels.fetch(id).catch(() => null);

  const query = String(input || '').trim().toLowerCase();
  if (!query) return fallbackChannel || null;
  return guild.channels.cache.find((channel) => String(channel.name || '').toLowerCase() === query) || null;
}

async function saveAnalytics(guildId, data) {
  await Promise.all([
    db.setKv(ANALYTICS_NAMESPACE, guildId, data.stats || {}),
    db.setKv(ANALYTICS_DAILY_NAMESPACE, guildId, data.daily || {}),
    db.setKv(ANALYTICS_CHANNEL_NAMESPACE, guildId, data.channels || {}),
    db.setKv(ANALYTICS_MEMBER_NAMESPACE, guildId, data.members || {})
  ]);
}

module.exports = {
  name: 'messagecount',
  aliases: ['msgcount', 'msgs'],
  category: 'analytics',
  description: 'Inspect real stored message activity for the server, a channel, or a member.',
  usage: 'messagecount <server|user|channel|leaderboard|daily|weekly|monthly|reset> ...',
  examples: [
    'messagecount server',
    'messagecount user @rumi',
    'messagecount channel #general',
    'messagecount leaderboard',
    'messagecount reset user @rumi'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  slash: true,
  subcommands: [
    { name: 'server', description: 'Show lifetime and rolling server message totals.', usage: 'messagecount server', examples: ['messagecount server'] },
    { name: 'user', description: 'Show one member’s tracked message totals.', usage: 'messagecount user [@user|id|name]', examples: ['messagecount user @rumi'] },
    { name: 'channel', description: 'Show one channel’s tracked message totals.', usage: 'messagecount channel [#channel|id|name]', examples: ['messagecount channel #general'] },
    { name: 'leaderboard', description: 'Show the most active message senders.', usage: 'messagecount leaderboard', examples: ['messagecount leaderboard'] },
    { name: 'daily', description: 'Show the server’s daily message total.', usage: 'messagecount daily', examples: ['messagecount daily'] },
    { name: 'weekly', description: 'Show the server’s 7-day message total.', usage: 'messagecount weekly', examples: ['messagecount weekly'] },
    { name: 'monthly', description: 'Show the server’s 30-day message total.', usage: 'messagecount monthly', examples: ['messagecount monthly'] },
    { name: 'reset', description: 'Reset message stats for the server, a member, or a channel.', usage: 'messagecount reset <server|user|channel> [...]', examples: ['messagecount reset server', 'messagecount reset user @rumi'] }
  ],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'server').toLowerCase();
    const analytics = await loadAnalytics(message.guild.id).catch(() => null);
    if (!analytics) {
      return respond.reply(message, 'bad', 'I could not read message analytics right now.');
    }

    if (sub === 'server') {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Server message count',
        fields: [
          { name: 'Lifetime', value: String(Number(analytics.stats.messageCount || 0)), inline: true },
          { name: 'Today', value: String(sumDailyMessages(analytics.daily, 1)), inline: true },
          { name: 'This week', value: String(sumDailyMessages(analytics.daily, 7)), inline: true },
          { name: 'This month', value: String(sumDailyMessages(analytics.daily, 30)), inline: true },
          { name: 'Last message', value: formatTime(analytics.stats.lastMessageAt), inline: false }
        ]
      });
    }

    if (sub === 'daily' || sub === 'weekly' || sub === 'monthly') {
      const days = sub === 'daily' ? 1 : sub === 'weekly' ? 7 : 30;
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Server message count · ${sub}`,
        description: `Tracked messages in the last **${days}** day${days === 1 ? '' : 's'}: **${sumDailyMessages(analytics.daily, days)}**`
      });
    }

    if (sub === 'user' || sub === 'member') {
      const target = await findMember(message.guild, args.join(' '), message.author.id);
      if (!target) return respond.reply(message, 'bad', 'I could not resolve that member.');
      const row = analytics.members[target.id] || { messageCount: 0, lastMessageAt: null };
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Message count · ${target.displayName}`,
        fields: [
          { name: 'Lifetime messages', value: String(Number(row.messageCount || 0)), inline: true },
          { name: 'Last message', value: formatTime(row.lastMessageAt), inline: true }
        ]
      });
    }

    if (sub === 'channel') {
      const channel = await resolveChannel(message.guild, args.join(' '), message.channel);
      if (!channel) return respond.reply(message, 'bad', 'I could not resolve that channel.');
      const row = analytics.channels[channel.id] || { messageCount: 0, lastMessageAt: null };
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Message count · #${channel.name || channel.id}`,
        fields: [
          { name: 'Lifetime messages', value: String(Number(row.messageCount || 0)), inline: true },
          { name: 'Last message', value: formatTime(row.lastMessageAt), inline: true }
        ]
      });
    }

    if (sub === 'leaderboard' || sub === 'top') {
      const rows = Object.values(analytics.members || {})
        .sort((left, right) => Number(right.messageCount || 0) - Number(left.messageCount || 0))
        .slice(0, 10);

      if (!rows.length) {
        return respond.reply(message, 'info', 'No message activity has been tracked yet.', { mentionUser: false });
      }

      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Message leaderboard',
        fields: rows.map((row, index) => ({
          name: `#${index + 1} <@${row.userId}>`,
          value: `Messages: **${Number(row.messageCount || 0)}**\nLast: ${formatTime(row.lastMessageAt)}`,
          inline: false
        }))
      });
    }

    if (sub === 'reset') {
      const targetType = String(args.shift() || '').toLowerCase();
      if (!['server', 'user', 'channel'].includes(targetType)) {
        return respond.reply(message, 'info', 'Use `messagecount reset <server|user|channel> [...]`.', { mentionUser: false });
      }

      if (targetType === 'server') {
        analytics.stats.messageCount = 0;
        analytics.stats.lastMessageAt = null;
        for (const key of Object.keys(analytics.daily || {})) {
          analytics.daily[key] = {
            ...(analytics.daily[key] || {}),
            messageCount: 0
          };
        }
        for (const key of Object.keys(analytics.channels || {})) {
          analytics.channels[key] = {
            ...(analytics.channels[key] || {}),
            messageCount: 0,
            lastMessageAt: null
          };
        }
        for (const key of Object.keys(analytics.members || {})) {
          analytics.members[key] = {
            ...(analytics.members[key] || {}),
            messageCount: 0,
            lastMessageAt: null
          };
        }
        await saveAnalytics(message.guild.id, analytics).catch(() => null);
        return respond.reply(message, 'good', 'Reset tracked message totals for this server.');
      }

      if (targetType === 'user') {
        const target = await findMember(message.guild, args.join(' '), message.author.id);
        if (!target) return respond.reply(message, 'bad', 'I could not resolve that member.');
        analytics.members[target.id] = {
          ...(analytics.members[target.id] || { userId: target.id }),
          userId: target.id,
          messageCount: 0,
          lastMessageAt: null
        };
        await saveAnalytics(message.guild.id, analytics).catch(() => null);
        return respond.reply(message, 'good', `Reset tracked message totals for ${target.displayName}.`);
      }

      const channel = await resolveChannel(message.guild, args.join(' '), message.channel);
      if (!channel) return respond.reply(message, 'bad', 'I could not resolve that channel.');
      analytics.channels[channel.id] = {
        ...(analytics.channels[channel.id] || { channelId: channel.id }),
        channelId: channel.id,
        messageCount: 0,
        lastMessageAt: null
      };
      await saveAnalytics(message.guild.id, analytics).catch(() => null);
      return respond.reply(message, 'good', `Reset tracked message totals for ${channel}.`);
    }

    return respond.reply(message, 'info', 'Use `messagecount <server|user|channel|leaderboard|daily|weekly|monthly|reset>`.', {
      mentionUser: false
    });
  }
};
