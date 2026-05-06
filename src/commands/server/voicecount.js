const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { findMember } = require('../../utils/memberResolver');
const { extractId } = require('../../utils/resolveUser');
const { getActiveVoiceSessionsForGuild } = require('../../systems/analytics/serverAnalytics');

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

function sumDailyVoice(daily, days) {
  return pickDateRange(days).reduce((total, key) => {
    return total + Number((daily?.[key] || {}).voiceSecondsTotal || 0);
  }, 0);
}

function sumDailyVoiceSessions(daily, days) {
  return pickDateRange(days).reduce((total, key) => {
    return total + Number((daily?.[key] || {}).voiceSessionCount || 0);
  }, 0);
}

function formatTime(value) {
  if (!value) return 'not tracked yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'not tracked yet';
  return `<t:${Math.floor(date.getTime() / 1000)}:R>`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours && minutes) return `${hours}h ${minutes}m`;
  if (hours) return `${hours}h`;
  return `${minutes}m`;
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

async function resolveChannel(guild, input, fallbackChannel = null) {
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
  name: 'voicecount',
  aliases: ['vccount', 'voiceactivity'],
  category: 'analytics',
  description: 'Inspect real tracked voice activity for the server, channels, and members.',
  usage: 'voicecount <server|user|channel|leaderboard|active|daily|weekly|monthly|reset> ...',
  examples: [
    'voicecount server',
    'voicecount user @rumi',
    'voicecount channel General',
    'voicecount active',
    'voicecount reset channel General'
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  slash: true,
  subcommands: [
    { name: 'server', description: 'Show lifetime and rolling voice totals for the server.', usage: 'voicecount server', examples: ['voicecount server'] },
    { name: 'user', description: 'Show one member’s tracked voice totals.', usage: 'voicecount user [@user|id|name]', examples: ['voicecount user @rumi'] },
    { name: 'channel', description: 'Show one channel’s tracked voice totals.', usage: 'voicecount channel [#channel|id|name]', examples: ['voicecount channel #general'] },
    { name: 'leaderboard', description: 'Show the most active voice users.', usage: 'voicecount leaderboard', examples: ['voicecount leaderboard'] },
    { name: 'active', description: 'Show who is currently active in voice.', usage: 'voicecount active', examples: ['voicecount active'] },
    { name: 'daily', description: 'Show the server’s daily voice total.', usage: 'voicecount daily', examples: ['voicecount daily'] },
    { name: 'weekly', description: 'Show the server’s 7-day voice total.', usage: 'voicecount weekly', examples: ['voicecount weekly'] },
    { name: 'monthly', description: 'Show the server’s 30-day voice total.', usage: 'voicecount monthly', examples: ['voicecount monthly'] },
    { name: 'reset', description: 'Reset voice stats for the server, a member, or a channel.', usage: 'voicecount reset <server|user|channel> [...]', examples: ['voicecount reset server', 'voicecount reset user @rumi'] }
  ],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'server').toLowerCase();
    const analytics = await loadAnalytics(message.guild.id).catch(() => null);
    if (!analytics) {
      return respond.reply(message, 'bad', 'I could not read voice analytics right now.');
    }

    if (sub === 'server') {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Server voice activity',
        fields: [
          { name: 'Lifetime voice time', value: formatDuration(analytics.stats.voiceSecondsTotal || 0), inline: true },
          { name: 'Lifetime sessions', value: String(Number(analytics.stats.voiceSessionCount || 0)), inline: true },
          { name: 'This week', value: formatDuration(sumDailyVoice(analytics.daily, 7)), inline: true },
          { name: 'This month', value: formatDuration(sumDailyVoice(analytics.daily, 30)), inline: true },
          { name: 'Last voice activity', value: formatTime(analytics.stats.lastVoiceAt), inline: false }
        ]
      });
    }

    if (sub === 'daily' || sub === 'weekly' || sub === 'monthly') {
      const days = sub === 'daily' ? 1 : sub === 'weekly' ? 7 : 30;
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Server voice activity · ${sub}`,
        description: `Tracked voice time in the last **${days}** day${days === 1 ? '' : 's'}: **${formatDuration(sumDailyVoice(analytics.daily, days))}** across **${sumDailyVoiceSessions(analytics.daily, days)}** sessions.`
      });
    }

    if (sub === 'user' || sub === 'member') {
      const target = await findMember(message.guild, args.join(' '), message.author.id);
      if (!target) return respond.reply(message, 'bad', 'I could not resolve that member.');
      const row = analytics.members[target.id] || { voiceSecondsTotal: 0, voiceSessionCount: 0, lastVoiceAt: null };
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Voice activity · ${target.displayName}`,
        fields: [
          { name: 'Lifetime voice time', value: formatDuration(row.voiceSecondsTotal || 0), inline: true },
          { name: 'Sessions', value: String(Number(row.voiceSessionCount || 0)), inline: true },
          { name: 'Last voice activity', value: formatTime(row.lastVoiceAt), inline: true }
        ]
      });
    }

    if (sub === 'channel') {
      const channel = await resolveChannel(message.guild, args.join(' '), message.channel);
      if (!channel) return respond.reply(message, 'bad', 'I could not resolve that channel.');
      const row = analytics.channels[channel.id] || { voiceSecondsTotal: 0, voiceSessionCount: 0, lastVoiceAt: null };
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Voice activity · #${channel.name || channel.id}`,
        fields: [
          { name: 'Lifetime voice time', value: formatDuration(row.voiceSecondsTotal || 0), inline: true },
          { name: 'Sessions', value: String(Number(row.voiceSessionCount || 0)), inline: true },
          { name: 'Last voice activity', value: formatTime(row.lastVoiceAt), inline: true }
        ]
      });
    }

    if (sub === 'leaderboard' || sub === 'top') {
      const rows = Object.values(analytics.members || {})
        .sort((left, right) => Number(right.voiceSecondsTotal || 0) - Number(left.voiceSecondsTotal || 0))
        .slice(0, 10);

      if (!rows.length) {
        return respond.reply(message, 'info', 'No voice activity has been tracked yet.', { mentionUser: false });
      }

      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Voice leaderboard',
        fields: rows.map((row, index) => ({
          name: `#${index + 1} <@${row.userId}>`,
          value: `Voice: **${formatDuration(row.voiceSecondsTotal || 0)}**\nSessions: **${Number(row.voiceSessionCount || 0)}**`,
          inline: false
        }))
      });
    }

    if (sub === 'active' || sub === 'now') {
      const sessions = getActiveVoiceSessionsForGuild(message.guild.id);
      if (!sessions.length) {
        return respond.reply(message, 'info', 'No one is currently active in voice.', { mentionUser: false });
      }

      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Active voice users',
        fields: sessions.slice(0, 10).map((row, index) => ({
          name: `#${index + 1} <@${row.userId}>`,
          value: `Channel: ${row.channelId ? `<#${row.channelId}>` : 'unknown'}\nActive for: **${formatDuration(row.activeSeconds)}**`,
          inline: false
        }))
      });
    }

    if (sub === 'reset') {
      const targetType = String(args.shift() || '').toLowerCase();
      if (!['server', 'user', 'channel'].includes(targetType)) {
        return respond.reply(message, 'info', 'Use `voicecount reset <server|user|channel> [...]`.', { mentionUser: false });
      }

      if (targetType === 'server') {
        analytics.stats.voiceJoinCount = 0;
        analytics.stats.voiceSecondsTotal = 0;
        analytics.stats.voiceSessionCount = 0;
        analytics.stats.lastVoiceAt = null;
        for (const key of Object.keys(analytics.daily || {})) {
          analytics.daily[key] = {
            ...(analytics.daily[key] || {}),
            voiceJoinCount: 0,
            voiceSecondsTotal: 0,
            voiceSessionCount: 0
          };
        }
        for (const key of Object.keys(analytics.channels || {})) {
          analytics.channels[key] = {
            ...(analytics.channels[key] || {}),
            voiceSecondsTotal: 0,
            voiceSessionCount: 0,
            lastVoiceAt: null
          };
        }
        for (const key of Object.keys(analytics.members || {})) {
          analytics.members[key] = {
            ...(analytics.members[key] || {}),
            voiceSecondsTotal: 0,
            voiceSessionCount: 0,
            lastVoiceAt: null
          };
        }
        await saveAnalytics(message.guild.id, analytics).catch(() => null);
        return respond.reply(message, 'good', 'Reset tracked voice totals for this server.');
      }

      if (targetType === 'user') {
        const target = await findMember(message.guild, args.join(' '), message.author.id);
        if (!target) return respond.reply(message, 'bad', 'I could not resolve that member.');
        analytics.members[target.id] = {
          ...(analytics.members[target.id] || { userId: target.id }),
          userId: target.id,
          voiceSecondsTotal: 0,
          voiceSessionCount: 0,
          lastVoiceAt: null
        };
        await saveAnalytics(message.guild.id, analytics).catch(() => null);
        return respond.reply(message, 'good', `Reset tracked voice totals for ${target.displayName}.`);
      }

      const channel = await resolveChannel(message.guild, args.join(' '), message.channel);
      if (!channel) return respond.reply(message, 'bad', 'I could not resolve that channel.');
      analytics.channels[channel.id] = {
        ...(analytics.channels[channel.id] || { channelId: channel.id }),
        channelId: channel.id,
        voiceSecondsTotal: 0,
        voiceSessionCount: 0,
        lastVoiceAt: null
      };
      await saveAnalytics(message.guild.id, analytics).catch(() => null);
      return respond.reply(message, 'good', `Reset tracked voice totals for ${channel}.`);
    }

    return respond.reply(message, 'info', 'Use `voicecount <server|user|channel|leaderboard|active|daily|weekly|monthly|reset>`.', {
      mentionUser: false
    });
  }
};
