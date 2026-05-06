const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { getGuildAnalyticsRollup } = require('../../systems/analytics/serverAnalytics');

function hours(seconds) {
  return `${(Number(seconds || 0) / 3600).toFixed(1)}h`;
}

function energyLabel(window) {
  const messages = Number(window?.messageCount || 0);
  const voiceHours = Number(window?.voiceSecondsTotal || 0) / 3600;
  if (messages >= 400 || voiceHours >= 20) return 'The room feels loud and alive.';
  if (messages >= 120 || voiceHours >= 8) return 'There is a healthy pulse running through the server.';
  if (messages >= 25 || voiceHours >= 2) return 'Things feel steady, with enough movement to keep the lights warm.';
  return 'It has been a quieter stretch, with more stillness than motion.';
}

function percentDelta(current, previous) {
  const left = Number(current || 0);
  const right = Number(previous || 0);
  if (!right && !left) return 'flat';
  if (!right) return 'up from a blank week';
  const delta = ((left - right) / right) * 100;
  if (Math.abs(delta) < 5) return 'holding steady';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(0)}%`;
}

module.exports = {
  name: 'pulse',
  category: 'analytics',
  description: 'Turns raw activity into a server heartbeat, with today, week, channel, and member views.',
  usage: 'pulse [today|week|compare|channel|members]',
  examples: ['pulse', 'pulse today', 'pulse compare', 'pulse channel'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  slash: true,
  subcommands: [
    { name: 'today', description: 'Show today’s server pulse.', usage: 'pulse today', examples: ['pulse today'] },
    { name: 'week', description: 'Show the last seven days of pulse data.', usage: 'pulse week', examples: ['pulse week'] },
    { name: 'compare', description: 'Compare this week against the previous one.', usage: 'pulse compare', examples: ['pulse compare'] },
    { name: 'channel', description: 'Show the busiest channels by tracked messages.', usage: 'pulse channel', examples: ['pulse channel'] },
    { name: 'members', description: 'Show the most active members by message and voice energy.', usage: 'pulse members', examples: ['pulse members'] }
  ],

  async execute({ message, args }) {
    const mode = String(args.shift() || 'overview').toLowerCase();
    const rollup = await getGuildAnalyticsRollup(message.guild.id).catch(() => null);
    if (!rollup) return respond.reply(message, 'bad', 'I could not read the server pulse right now.');

    if (mode === 'overview' || mode === 'status' || mode === 'pulse') {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `${message.guild.name} pulse`,
        description: energyLabel(rollup.today),
        fields: [
          { name: 'Today', value: `Messages: **${rollup.today.messageCount}**\nVoice: **${hours(rollup.today.voiceSecondsTotal)}**\nJoins / leaves: **${rollup.today.joinCount} / ${rollup.today.leaveCount}**`, inline: true },
          { name: 'This week', value: `Messages: **${rollup.week.messageCount}**\nVoice: **${hours(rollup.week.voiceSecondsTotal)}**\nVoice sessions: **${rollup.week.voiceSessionCount}**`, inline: true },
          { name: 'Lifetime tracked', value: `Messages: **${rollup.lifetime.messageCount}**\nVoice: **${hours(rollup.lifetime.voiceSecondsTotal)}**`, inline: true }
        ]
      });
    }

    if (mode === 'today') {
      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Pulse today',
        fields: [
          { name: 'Messages', value: String(rollup.today.messageCount), inline: true },
          { name: 'Voice time', value: hours(rollup.today.voiceSecondsTotal), inline: true },
          { name: 'Voice sessions', value: String(rollup.today.voiceSessionCount), inline: true },
          { name: 'Joins', value: String(rollup.today.joinCount), inline: true },
          { name: 'Leaves', value: String(rollup.today.leaveCount), inline: true },
          { name: 'Read', value: energyLabel(rollup.today), inline: false }
        ]
      });
    }

    if (mode === 'week') {
      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Pulse this week',
        fields: [
          { name: 'Messages', value: String(rollup.week.messageCount), inline: true },
          { name: 'Voice time', value: hours(rollup.week.voiceSecondsTotal), inline: true },
          { name: 'Voice sessions', value: String(rollup.week.voiceSessionCount), inline: true },
          { name: 'Joins / leaves', value: `${rollup.week.joinCount} / ${rollup.week.leaveCount}`, inline: true },
          { name: 'Daily rhythm', value: `~${Math.round(rollup.week.messageCount / 7)} messages/day\n~${(rollup.week.voiceSecondsTotal / 3600 / 7).toFixed(1)} voice hours/day`, inline: false }
        ]
      });
    }

    if (mode === 'compare') {
      const currentPerDay = Math.round(rollup.week.messageCount / 7);
      const previousPerDay = Math.round(rollup.previousWeek.messageCount / 7);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Pulse comparison',
        fields: [
          { name: 'Messages/day', value: `This week: **${currentPerDay}**\nLast week: **${previousPerDay}**\nChange: **${percentDelta(currentPerDay, previousPerDay)}**`, inline: true },
          { name: 'Voice/day', value: `This week: **${(rollup.week.voiceSecondsTotal / 3600 / 7).toFixed(1)}h**\nLast week: **${(rollup.previousWeek.voiceSecondsTotal / 3600 / 7).toFixed(1)}h**\nChange: **${percentDelta(rollup.week.voiceSecondsTotal, rollup.previousWeek.voiceSecondsTotal)}**`, inline: true },
          { name: 'Read', value: `The server is **${percentDelta(rollup.week.messageCount, rollup.previousWeek.messageCount)}** compared with the week before.`, inline: false }
        ]
      });
    }

    if (mode === 'channel' || mode === 'channels') {
      const top = rollup.channels.slice(0, 5);
      if (!top.length) return respond.reply(message, 'info', 'No channel pulse data has built up yet.', { mentionUser: false });
      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Pulse by channel',
        fields: top.map((entry, index) => ({
          name: `#${index + 1} ${message.guild.channels.cache.get(entry.channelId)?.toString?.() || entry.channelId}`,
          value: `Messages: **${entry.messageCount || 0}**\nLast active: ${entry.lastMessageAt ? `<t:${Math.floor(new Date(entry.lastMessageAt).getTime() / 1000)}:R>` : 'n/a'}`,
          inline: false
        }))
      });
    }

    if (mode === 'members' || mode === 'people') {
      const top = rollup.members.slice(0, 5);
      if (!top.length) return respond.reply(message, 'info', 'No member pulse data has built up yet.', { mentionUser: false });
      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Pulse by member',
        fields: top.map((entry, index) => ({
          name: `#${index + 1} <@${entry.userId}>`,
          value: `Messages: **${entry.messageCount || 0}**\nVoice: **${hours(entry.voiceSecondsTotal)}**\nSessions: **${entry.voiceSessionCount || 0}**`,
          inline: false
        }))
      });
    }

    return respond.reply(message, 'info', 'Use `pulse [today|week|compare|channel|members]`.', {
      mentionUser: false
    });
  }
};
