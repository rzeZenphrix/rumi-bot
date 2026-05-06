const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const db = require('../../services/database');
const { getAutoJailConfig, updateAutoJailConfig, maybeAutoJailMember, normalizeAutoJailConfig } = require('../../systems/autojail/engine');

function parseBool(input) {
  const value = String(input || '').toLowerCase();
  if (['on', 'true', 'yes', 'enable', 'enabled'].includes(value)) return true;
  if (['off', 'false', 'no', 'disable', 'disabled'].includes(value)) return false;
  return null;
}

module.exports = {
  name: 'autojail',
  aliases: ['aj', 'jailauto'],
  category: 'security',
  description: 'Configure rule-based automatic jailing for suspicious members.',
  usage: 'autojail <status|enable|disable|mode|interval|age|avatar|keyword|nsfwavatar|scan>',
  examples: ['autojail status', 'autojail mode join', 'autojail age 7', 'autojail keyword add scam', 'autojail scan'],
  subcommands: [
    { name: 'status', description: 'Show current AutoJail rules and mode.', usage: 'autojail status', examples: ['autojail status'] },
    { name: 'enable', aliases: ['on'], description: 'Enable AutoJail.', usage: 'autojail enable', examples: ['autojail enable'] },
    { name: 'disable', aliases: ['off'], description: 'Disable AutoJail.', usage: 'autojail disable', examples: ['autojail disable'] },
    { name: 'mode', description: 'Choose join-only or scheduled scanning.', usage: 'autojail mode <join|scheduled>', examples: ['autojail mode join', 'autojail mode scheduled'] },
    { name: 'interval', aliases: ['every'], description: 'Set the scheduled scan interval in minutes.', usage: 'autojail interval <minutes>', examples: ['autojail interval 60'] },
    { name: 'age', aliases: ['accountage'], description: 'Autojail very new accounts by age in days.', usage: 'autojail age <days|off>', examples: ['autojail age 7', 'autojail age off'] },
    { name: 'avatar', aliases: ['pfp'], description: 'Toggle jailing for users with no profile picture.', usage: 'autojail avatar <on|off>', examples: ['autojail avatar on'] },
    { name: 'keyword', aliases: ['keywords'], description: 'Manage profile/name keywords that trigger AutoJail.', usage: 'autojail keyword <add|remove|list> [word]', examples: ['autojail keyword add scam', 'autojail keyword list'] },
    { name: 'nsfwavatar', aliases: ['nsfwpfp'], description: 'Store the premium-only NSFW avatar rule toggle.', usage: 'autojail nsfwavatar <on|off>', examples: ['autojail nsfwavatar on'] },
    { name: 'scan', aliases: ['run'], description: 'Manually scan current members once.', usage: 'autojail scan', examples: ['autojail scan'] }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const sub = String(args.shift() || 'status').toLowerCase();
    const config = await getAutoJailConfig(message.guild.id).catch(() => null);

    if (!config) {
      return respond.reply(message, 'bad', 'I could not load AutoJail settings because the database is currently unreachable.');
    }

    if (sub === 'status') {
      const settings = await db.getGuildSettings(message.guild.id).catch(() => null);
      const setupHint = !settings?.jail_role_id || !settings?.jail_channel_id
        ? '\n**Setup:** `jailsetup` still needs to be run before AutoJail can enforce.'
        : '';
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: [
          `**Enabled:** \`${config.enabled}\``,
          `**Mode:** \`${config.mode}\``,
          `**Interval:** \`${config.intervalMinutes} minute(s)\``,
          `**Account age trigger:** \`${config.accountAgeDays || 'off'}\``,
          `**No avatar trigger:** \`${config.noAvatar}\``,
          `**Keywords:** ${config.keywords.length ? config.keywords.join(', ') : 'none'}`,
          `**NSFW avatar scan:** \`${config.nsfwAvatarPremium ? 'configured (premium-only)' : 'off'}\``
        ].join('\n') + setupHint
      });
    }

    if (sub === 'enable' || sub === 'on') {
      await updateAutoJailConfig(message.guild.id, (current) => ({ ...current, enabled: true }));
      return respond.reply(message, 'good', 'AutoJail is now enabled.');
    }

    if (sub === 'disable' || sub === 'off') {
      await updateAutoJailConfig(message.guild.id, (current) => ({ ...current, enabled: false }));
      return respond.reply(message, 'good', 'AutoJail is now disabled.');
    }

    if (sub === 'mode') {
      const mode = String(args[0] || '').toLowerCase();
      if (!['join', 'scheduled'].includes(mode)) {
        return respond.reply(message, 'info', 'Use `autojail mode <join|scheduled>`.');
      }
      await updateAutoJailConfig(message.guild.id, (current) => ({ ...current, mode }));
      return respond.reply(message, 'good', `AutoJail mode is now **${mode}**.`);
    }

    if (sub === 'interval' || sub === 'every') {
      const interval = Math.round(Number(args[0] || 0));
      if (!Number.isFinite(interval) || interval < 5) {
        return respond.reply(message, 'info', 'Use `autojail interval <minutes>` with a value of at least 5.');
      }
      await updateAutoJailConfig(message.guild.id, (current) => ({ ...current, intervalMinutes: interval }));
      return respond.reply(message, 'good', `AutoJail scheduled scans will run every **${interval}** minute(s).`);
    }

    if (sub === 'age' || sub === 'accountage') {
      const value = String(args[0] || '').toLowerCase();
      const days = value === 'off' ? 0 : Math.round(Number(value || 0));
      if (!Number.isFinite(days) || days < 0) {
        return respond.reply(message, 'info', 'Use `autojail age <days|off>`.');
      }
      await updateAutoJailConfig(message.guild.id, (current) => ({ ...current, accountAgeDays: days }));
      return respond.reply(message, 'good', days > 0
        ? `AutoJail will catch accounts younger than **${days}** day(s).`
        : 'Account-age AutoJail trigger is now off.');
    }

    if (sub === 'avatar' || sub === 'pfp') {
      const enabled = parseBool(args[0]);
      if (enabled === null) return respond.reply(message, 'info', 'Use `autojail avatar <on|off>`.');
      await updateAutoJailConfig(message.guild.id, (current) => ({ ...current, noAvatar: enabled }));
      return respond.reply(message, 'good', `No-avatar AutoJail trigger is now **${enabled ? 'on' : 'off'}**.`);
    }

    if (sub === 'keyword' || sub === 'keywords') {
      const action = String(args.shift() || 'list').toLowerCase();
      const word = args.join(' ').trim().toLowerCase();

      if (action === 'list') {
        const next = normalizeAutoJailConfig(config);
        return respond.reply(message, 'info', next.keywords.length
          ? `Current AutoJail keywords: ${next.keywords.join(', ')}`
          : 'No AutoJail keywords are configured.');
      }

      if (!word) {
        return respond.reply(message, 'info', 'Use `autojail keyword <add|remove> <word>`.');
      }

      if (!['add', 'remove'].includes(action)) {
        return respond.reply(message, 'info', 'Use `autojail keyword <add|remove|list> [word]`.');
      }

      const next = await updateAutoJailConfig(message.guild.id, (current) => {
        const keywords = new Set(current.keywords || []);
        if (action === 'add') keywords.add(word);
        if (action === 'remove') keywords.delete(word);
        return { ...current, keywords: [...keywords] };
      });

      return respond.reply(message, 'good', action === 'add'
        ? `Added **${word}** to AutoJail keywords.`
        : `Removed **${word}** from AutoJail keywords. Now tracking: ${next.keywords.length ? next.keywords.join(', ') : 'none'}.`);
    }

    if (sub === 'nsfwavatar' || sub === 'nsfwpfp') {
      const enabled = parseBool(args[0]);
      if (enabled === null) return respond.reply(message, 'info', 'Use `autojail nsfwavatar <on|off>`.');
      await updateAutoJailConfig(message.guild.id, (current) => ({ ...current, nsfwAvatarPremium: enabled }));
      return respond.reply(message, enabled
        ? 'alert'
        : 'good', enabled
        ? 'NSFW avatar scanning was saved as a premium-only AutoJail rule. The live image classifier is not wired in yet.'
        : 'NSFW avatar AutoJail rule is now off.');
    }

    if (sub === 'scan' || sub === 'run') {
      const members = await message.guild.members.fetch().catch(() => null);
      if (!members) {
        return respond.reply(message, 'bad', 'I could not fetch members for an AutoJail scan.');
      }

      let matched = 0;
      let setupBlocked = 0;
      let permissionBlocked = 0;
      let failed = 0;
      let lastProblem = null;
      for (const member of members.values()) {
        const result = await maybeAutoJailMember(member, config.mode).catch(() => null);
        if (result?.ok || result?.alreadyJailed) matched += 1;
        else if (result?.reasonCode === 'setup_required') {
          setupBlocked += 1;
          lastProblem ||= result.reason;
        } else if (result?.reasonCode === 'missing_permissions' || result?.reasonCode === 'manageability') {
          permissionBlocked += 1;
          lastProblem ||= result.reason;
        } else if (result?.reasonCode && !['disabled', 'mode', 'bypass', 'clean'].includes(result.reasonCode)) {
          failed += 1;
          lastProblem ||= result.reason;
        }
      }

      if (setupBlocked > 0) {
        return respond.reply(
          message,
          'alert',
          `AutoJail scan stopped because jail setup is incomplete. Run \`jailsetup\` first.\n\nMatched **${matched}** member(s) before the blocker.\n${lastProblem || 'The jail role or jail channel is missing.'}`
        );
      }

      if (permissionBlocked > 0) {
        return respond.reply(
          message,
          'alert',
          `AutoJail scan found matches, but I am missing something needed to jail people cleanly.\n\nMatched **${matched}** member(s)\nPermission/setup blocks: **${permissionBlocked}**\n${lastProblem || 'Check the jail role position and my Manage Roles permission.'}`
        );
      }

      return respond.reply(message, 'good', `AutoJail scan finished. Matched **${matched}** member(s).${failed ? ` Other failures: **${failed}**.` : ''}`);
    }

    return respond.reply(message, 'info', 'Use `autojail <status|enable|disable|mode|interval|age|avatar|keyword|nsfwavatar|scan>`.');
  }
};
