const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { getGuildAnalyticsRollup } = require('../../systems/analytics/serverAnalytics');
const { getProtectionSettings } = require('../../systems/security/protectionConfig');
const { getDisabledCommands } = require('../../systems/commands/disabledCommands');
const { getGuildMessagesConfig } = require('../../systems/messages/guildMessages');
const { getCommandNotFoundSettings } = require('../../systems/prefix/commandNotFoundSetting');

function statusWord(value) {
  return value ? 'on' : 'off';
}

function summarizeMessageSystems(config) {
  const enabled = [];
  if (config.welcome.enabled) enabled.push('welcome');
  if (config.leave.enabled) enabled.push('leave');
  if (config.dm.enabled) enabled.push('join dm');
  if (config.ping.enabled) enabled.push('join ping');
  if (config.system.enabled) enabled.push('system');
  return enabled.length ? enabled.join(', ') : 'none';
}

module.exports = {
  name: 'signal',
  category: 'analytics',
  description: 'Combines activity, security, message systems, and command state into one situational readout.',
  usage: 'signal <overview|security|activity|changes|recommend>',
  examples: ['signal overview', 'signal security', 'signal recommend'],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],
  slash: true,
  subcommands: [
    { name: 'overview', description: 'Show a high-level server signal summary.', usage: 'signal overview', examples: ['signal overview'] },
    { name: 'security', description: 'Show the security posture signal.', usage: 'signal security', examples: ['signal security'] },
    { name: 'activity', description: 'Show the activity signal.', usage: 'signal activity', examples: ['signal activity'] },
    { name: 'changes', description: 'Show recent security and moderation changes.', usage: 'signal changes', examples: ['signal changes'] },
    { name: 'recommend', description: 'Show actionable recommendations.', usage: 'signal recommend', examples: ['signal recommend'] }
  ],

  async execute({ message, args }) {
    const mode = String(args.shift() || 'overview').toLowerCase();
    const [analytics, protection, disabled, messagesConfig, unknown, recentSecurity] = await Promise.all([
      getGuildAnalyticsRollup(message.guild.id).catch(() => null),
      getProtectionSettings(message.guild.id).catch(() => null),
      getDisabledCommands(message.guild.id).catch(() => ({})),
      getGuildMessagesConfig(message.guild.id).catch(() => null),
      getCommandNotFoundSettings(message.guild.id).catch(() => ({ enabled: true })),
      db.getRecentSecurityEvents({
        guildId: message.guild.id,
        since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        limit: 5
      }).catch(() => [])
    ]);

    if (!analytics || !protection || !messagesConfig) {
      return respond.reply(message, 'bad', 'I could not build the signal board right now.');
    }

    if (mode === 'overview') {
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `${message.guild.name} signal`,
        fields: [
          { name: 'Activity', value: `Today: **${analytics.today.messageCount}** messages\nWeek: **${analytics.week.messageCount}** messages`, inline: true },
          { name: 'Security', value: `Security: **${statusWord(protection.security.enabled)}**\nAnti-raid: **${statusWord(protection.antiraid.enabled)}**\nAnti-nuke: **${statusWord(protection.antinuke.enabled)}**`, inline: true },
          { name: 'Retention', value: `Joins: **${analytics.week.joinCount}**\nLeaves: **${analytics.week.leaveCount}**\nVoice hours: **${(analytics.week.voiceSecondsTotal / 3600).toFixed(1)}**`, inline: true },
          { name: 'Command surface', value: `Disabled entries: **${Object.keys(disabled).length}**\nUnknown-command reply: **${statusWord(unknown.enabled)}**`, inline: true },
          { name: 'Message systems', value: summarizeMessageSystems(messagesConfig), inline: true }
        ]
      });
    }

    if (mode === 'security') {
      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Signal: security posture',
        fields: [
          { name: 'Global switch', value: protection.security.enabled ? 'enabled' : 'disabled', inline: true },
          { name: 'Anti-raid', value: protection.antiraid.enabled ? `on (${protection.antiraid.action || 'alert'})` : 'off', inline: true },
          { name: 'Anti-nuke', value: protection.antinuke.enabled ? `on (${protection.antinuke.punishment || 'strip'})` : 'off', inline: true },
          { name: 'Bypasses', value: `Raid: **${(protection.antiraid.whitelist || []).length}**\nNuke: **${(protection.antinuke.whitelist || []).length}**`, inline: true },
          { name: 'Recent events', value: recentSecurity.length ? recentSecurity.map((entry) => `• ${entry.event_type} <t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:R>`).join('\n') : 'No recent security events.', inline: false }
        ]
      });
    }

    if (mode === 'activity') {
      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Signal: activity',
        fields: [
          { name: 'Today', value: `Messages: **${analytics.today.messageCount}**\nVoice: **${(analytics.today.voiceSecondsTotal / 3600).toFixed(1)}h**`, inline: true },
          { name: 'Week', value: `Messages: **${analytics.week.messageCount}**\nVoice: **${(analytics.week.voiceSecondsTotal / 3600).toFixed(1)}h**`, inline: true },
          { name: 'People flow', value: `Joins: **${analytics.week.joinCount}**\nLeaves: **${analytics.week.leaveCount}**`, inline: true },
          { name: 'Message systems', value: summarizeMessageSystems(messagesConfig), inline: false }
        ]
      });
    }

    if (mode === 'changes') {
      return respond.reply(message, 'list', null, {
        mentionUser: false,
        title: 'Signal: recent changes',
        fields: [
          {
            name: 'Security events',
            value: recentSecurity.length
              ? recentSecurity.map((entry) => `• ${entry.event_type} • <t:${Math.floor(new Date(entry.created_at).getTime() / 1000)}:R>`).join('\n')
              : 'Nothing recent in the security log.'
          },
          {
            name: 'Message systems',
            value: `Welcome: **${statusWord(messagesConfig.welcome.enabled)}**\nLeave: **${statusWord(messagesConfig.leave.enabled)}**\nJoin DM: **${statusWord(messagesConfig.dm.enabled)}**\nSticky entries: **${messagesConfig.sticky.length}**`
          }
        ]
      });
    }

    if (mode === 'recommend') {
      const suggestions = [];
      if (!protection.security.enabled) suggestions.push('Turn on the security system before you expect it to catch anything.');
      if (!protection.antiraid.enabled) suggestions.push('Anti-raid is still off; set a mode and a threshold before a rush hits.');
      if (!messagesConfig.welcome.enabled && !messagesConfig.leave.enabled) suggestions.push('The server has no join or leave voice yet; turn on welcome or leave messages so the room feels alive.');
      if (!messagesConfig.dm.enabled) suggestions.push('Join DMs are still off; enabling them can make onboarding feel more intentional.');
      if (!messagesConfig.sticky.length) suggestions.push('Sticky messages are empty right now; use one for rules, channel purpose, or recurring reminders.');
      if (!messagesConfig.system.enabled) suggestions.push('Invoke messages are off; enabling them helps staff actions feel visible and consistent.');
      if (!Object.keys(disabled).length) suggestions.push('Your command surface is wide open right now; if staff workflows differ, disable the noisy edges.');

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Signal: recommendations',
        description: suggestions.length
          ? suggestions.map((item) => `• ${item}`).join('\n')
          : 'Nothing is obviously missing. The server already looks intentional.'
      });
    }

    return respond.reply(message, 'info', 'Use `signal <overview|security|activity|changes|recommend>`.', {
      mentionUser: false
    });
  }
};
