const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const { getEconomySettings, updateEconomySettings, resetEconomySettings, logEconomyAudit, listEconomyAudit } = require('../../systems/economy/settings');
const { formatCoins, updateAccount, listGuildTransactions } = require('../../systems/economy/store');
const { getPremiumAccessForMessage, requireServerPremium, requireServerTier } = require('../../systems/monetization/access');

function parseAmount(input) {
  const value = Math.floor(Number(input));
  return Number.isFinite(value) ? value : NaN;
}

function parseBool(input) {
  const value = String(input || '').toLowerCase();
  if (['true', 'on', 'yes', 'enable', 'enabled'].includes(value)) return true;
  if (['false', 'off', 'no', 'disable', 'disabled'].includes(value)) return false;
  return null;
}

async function ensureManage(message) {
  if (message.guild.ownerId === message.author.id) return true;
  return message.member?.permissions?.has(PermissionFlagsBits.ManageGuild);
}

module.exports = {
  name: 'economy',
  aliases: ['econ'],
  category: 'economy',
  description: 'Configure server economy settings and inspect economy logs.',
  usage: 'economy <config|tax|inflation|reset|audit|logs> ...',
  examples: ['economy config', 'economy config currency petals', 'economy tax set 5', 'economy logs'],
  subcommands: [
    {
      name: 'config',
      aliases: ['settings'],
      description: 'View and edit server economy settings.',
      usage: 'economy config [currency|icon|daily|weekly|work|disable|enable|reset] ...',
      examples: ['economy config', 'economy config currency petals', 'economy config reset confirm']
    },
    {
      name: 'tax',
      description: 'Set the transfer tax rate for the server economy.',
      usage: 'economy tax set <0-100>',
      examples: ['economy tax set 5']
    },
    {
      name: 'inflation',
      aliases: ['inflationcontrol'],
      description: 'Toggle inflation control and set its rate.',
      usage: 'economy inflation control <on|off> [rate]',
      examples: ['economy inflation control on 2', 'economy inflation control off']
    },
    {
      name: 'reset',
      description: 'Reset all user balances for this server economy.',
      usage: 'economy reset confirm',
      examples: ['economy reset confirm']
    },
    {
      name: 'audit',
      description: 'Show recent economy setting changes.',
      usage: 'economy audit',
      examples: ['economy audit']
    },
    {
      name: 'logs',
      aliases: ['transactions'],
      description: 'Show recent economy transactions.',
      usage: 'economy logs',
      examples: ['economy logs']
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.ManageGuild],

  async execute({ message, args }) {
    const allowed = await ensureManage(message);
    if (!allowed) {
      return respond.reply(message, 'bad', 'You need Manage Server to configure the economy.');
    }

    const root = String(args.shift() || 'config').toLowerCase();

    if (root === 'config') {
      const sub = String(args.shift() || 'view').toLowerCase();
      const settings = await getEconomySettings(message.guild.id);

      if (sub === 'view') {
        const access = await getPremiumAccessForMessage(message).catch(() => null);
        return respond.reply(message, 'info', null, {
          mentionUser: false,
          description: [
            `**Currency:** ${settings.currencyIcon} ${settings.currencyName}`,
            `**Daily base:** \`${formatCoins(settings.dailyBase)}\``,
            `**Weekly base:** \`${formatCoins(settings.weeklyBase)}\``,
            `**Work range:** \`${formatCoins(settings.workMin)}\` - \`${formatCoins(settings.workMax)}\``,
            `**Cooldowns:** daily \`${settings.dailyCooldownSeconds}s\` | weekly \`${settings.weeklyCooldownSeconds}s\` | work \`${settings.workCooldownSeconds}s\``,
            `**Tax rate:** \`${settings.taxRate}%\``,
            `**Inflation:** \`${settings.inflationEnabled ? `on (${settings.inflationRate}%)` : 'off'}\``,
            `**Voter boost:** \`${settings.voterBoostEnabled ? 'on' : 'off'}\`${access?.economy?.canDisableVoterBoost ? '' : ' (free servers cannot disable it)'}`,
            `**Disabled commands:** ${settings.disabledCommands.length ? settings.disabledCommands.join(', ') : 'none'}`
          ].join('\n')
        });
      }

      if (sub === 'currency' || sub === 'icon') {
        const value = args.join(' ').trim();
        if (!value) return respond.reply(message, 'info', `Use \`economy config ${sub} <value>\`.`);
        const next = await updateEconomySettings(message.guild.id, (current) => {
          if (sub === 'currency') current.currencyName = value;
          else current.currencyIcon = value;
          return current;
        });
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `config.${sub}`, value });
        return respond.reply(message, 'good', `Updated economy ${sub} to **${sub === 'currency' ? next.currencyName : next.currencyIcon}**.`);
      }

      if (['daily', 'weekly'].includes(sub)) {
        const value = parseAmount(args[0]);
        if (!Number.isFinite(value) || value < 0) return respond.reply(message, 'info', `Use \`economy config ${sub} <amount>\`.`);
        const next = await updateEconomySettings(message.guild.id, (current) => {
          current[sub === 'daily' ? 'dailyBase' : 'weeklyBase'] = value;
          return current;
        });
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `config.${sub}`, value });
        return respond.reply(message, 'good', `Updated ${sub} reward to **${formatCoins(sub === 'daily' ? next.dailyBase : next.weeklyBase)}**.`);
      }

      if (sub === 'work') {
        const min = parseAmount(args[0]);
        const max = parseAmount(args[1]);
        if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
          return respond.reply(message, 'info', 'Use `economy config work <min> <max>`.');
        }
        const next = await updateEconomySettings(message.guild.id, (current) => {
          current.workMin = min;
          current.workMax = max;
          return current;
        });
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'config.work', value: `${min}-${max}` });
        return respond.reply(message, 'good', `Updated work range to **${formatCoins(next.workMin)}** - **${formatCoins(next.workMax)}**.`);
      }

      if (sub === 'cooldown') {
        const target = String(args[0] || '').toLowerCase();
        const seconds = parseAmount(args[1]);
        const fieldMap = {
          daily: 'dailyCooldownSeconds',
          weekly: 'weeklyCooldownSeconds',
          work: 'workCooldownSeconds'
        };
        const field = fieldMap[target];
        if (!field || !Number.isFinite(seconds) || seconds < 3) {
          return respond.reply(message, 'info', 'Use `economy config cooldown <daily|weekly|work> <seconds>`. Minimum is 3 seconds.');
        }

        const access = await getPremiumAccessForMessage(message).catch(() => null);
        if (!access?.hasServerPremiumBase) {
          const allowed = await requireServerPremium(message, 'Custom economy cooldowns', access).catch(() => null);
          if (!allowed) return null;
        }

        const next = await updateEconomySettings(message.guild.id, (current) => {
          current[field] = seconds;
          return current;
        });
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `config.cooldown.${target}`, value: seconds });
        return respond.reply(message, 'good', `Updated ${target} cooldown to **${next[field]}s**.`);
      }

      if (sub === 'voteboost') {
        const enabled = parseBool(args[0]);
        if (enabled === null) {
          return respond.reply(message, 'info', 'Use `economy config voteboost <on|off>`.');
        }

        const access = await getPremiumAccessForMessage(message).catch(() => null);
        if (!access?.economy?.canDisableVoterBoost) {
          const allowed = await requireServerTier(message, 'tier1', 'Voter boost toggles', access).catch(() => null);
          if (!allowed) return null;
        }

        const next = await updateEconomySettings(message.guild.id, (current) => {
          current.voterBoostEnabled = enabled;
          return current;
        });
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'config.voteboost', value: enabled });
        return respond.reply(message, 'good', `Voter boost is now **${next.voterBoostEnabled ? 'on' : 'off'}**.`);
      }

      if (sub === 'disable' || sub === 'enable') {
        const commandName = String(args[0] || '').toLowerCase();
        if (!commandName) return respond.reply(message, 'info', `Use \`economy config ${sub} <command>\`.`);
        const next = await updateEconomySettings(message.guild.id, (current) => {
          const set = new Set(current.disabledCommands || []);
          if (sub === 'disable') set.add(commandName);
          else set.delete(commandName);
          current.disabledCommands = [...set];
          return current;
        });
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: `config.${sub}`, value: commandName });
        return respond.reply(message, 'good', `${sub === 'disable' ? 'Disabled' : 'Enabled'} **${commandName}** for this economy.`);
      }

      if (sub === 'reset') {
        const confirm = String(args[0] || '').toLowerCase();
        if (confirm !== 'confirm') {
          return respond.reply(message, 'alert', 'Use `economy config reset confirm` to reset economy settings only.');
        }

        const next = await resetEconomySettings(message.guild.id);
        await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'config.reset', value: 'default-settings' });
        return respond.reply(message, 'good', `Economy settings were reset. Currency: **${next.currencyIcon} ${next.currencyName}**.`);
      }

      return respond.reply(message, 'info', 'Use `economy config`, `currency`, `icon`, `daily`, `weekly`, `work`, `cooldown`, `voteboost`, `disable`, `enable`, or `reset`.');
    }

    if (root === 'tax') {
      const sub = String(args.shift() || '').toLowerCase();
      const rate = Number(args.shift());
      if (sub !== 'set' || !Number.isFinite(rate) || rate < 0 || rate > 100) {
        return respond.reply(message, 'info', 'Use `economy tax set <0-100>`.');
      }

      const next = await updateEconomySettings(message.guild.id, (current) => {
        current.taxRate = rate;
        return current;
      });
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'tax.set', value: rate });
      return respond.reply(message, 'good', `Economy tax is now **${next.taxRate}%**.`);
    }

    if (root === 'inflation') {
      const sub = String(args.shift() || '').toLowerCase();
      if (sub !== 'control') {
        return respond.reply(message, 'info', 'Use `economy inflation control <on|off> [rate]`.');
      }
      const enabled = parseBool(args.shift());
      const rate = args[0] !== undefined ? Number(args[0]) : 0;
      if (enabled === null || !Number.isFinite(rate) || rate < 0 || rate > 100) {
        return respond.reply(message, 'info', 'Use `economy inflation control <on|off> [rate]`.');
      }
      const next = await updateEconomySettings(message.guild.id, (current) => {
        current.inflationEnabled = enabled;
        current.inflationRate = rate;
        return current;
      });
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'inflation.control', value: `${enabled}:${rate}` });
      return respond.reply(message, 'good', `Inflation control is now **${next.inflationEnabled ? `on (${next.inflationRate}%)` : 'off'}**.`);
    }

    if (root === 'reset') {
      const sub = String(args.shift() || '').toLowerCase();
      if (sub !== 'confirm') {
        return respond.reply(message, 'alert', 'Use `economy reset confirm` to reset balances for this server.');
      }

      const rows = await require('../../services/database').listKv(`guild:${message.guild.id}:economy`, 1000).catch(() => []);
      for (const row of rows) {
        await updateAccount(message.guild.id, row.key, () => ({
          cash: 0,
          bank: 0,
          inventory: [],
          lastDaily: 0,
          lastWeekly: 0,
          lastWork: 0,
          totalEarned: 0,
          totalSpent: 0,
          totalTransferredIn: 0,
          totalTransferredOut: 0
        })).catch(() => null);
      }
      await logEconomyAudit(message.guild.id, { actorId: message.author.id, action: 'reset', value: rows.length });
      return respond.reply(message, 'good', `Reset economy accounts for **${rows.length}** user(s).`);
    }

    if (root === 'audit') {
      const rows = await listEconomyAudit(message.guild.id, 10);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: rows.length
          ? rows.map((row, index) => `${index + 1}. **${row.action}** - \`${row.value ?? 'n/a'}\` - <t:${Math.floor(new Date(row.createdAt).getTime() / 1000)}:R>`).join('\n')
          : 'No economy audit entries yet.'
      });
    }

    if (root === 'logs') {
      const logs = await listGuildTransactions(message.guild.id, 15);
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: logs.length
          ? logs.map((row, index) => {
              const actor = row.userId || row.fromUserId || 'unknown';
              const target = row.toUserId ? ` -> <@${row.toUserId}>` : '';
              const tax = row.taxAmount ? ` | tax \`${formatCoins(row.taxAmount)}\`` : '';
              return `${index + 1}. **${row.type}** - <@${actor}>${target} - \`${formatCoins(row.amount)}\`${tax} - <t:${Math.floor(new Date(row.createdAt).getTime() / 1000)}:R>`;
            }).join('\n')
          : 'No economy logs yet.'
      });
    }

    return respond.reply(message, 'info', 'Use `economy config`, `tax`, `inflation`, `reset`, `audit`, or `logs`.');
  }
};
