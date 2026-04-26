const { PermissionFlagsBits } = require('discord.js');
const db = require('../../services/database');
const respond = require('../../utils/respond');
const { DEFAULT_THRESHOLDS } = require('../../utils/constants');

function getNested(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function setNested(obj, path, value) {
  const parts = path.split('.');
  const last = parts.pop();
  let current = obj;

  for (const part of parts) {
    current[part] ||= {};
    current = current[part];
  }

  current[last] = value;

  return obj;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatThresholds(thresholds) {
  const lines = [];

  function walk(node, prefix = '') {
    for (const [key, value] of Object.entries(node || {})) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && !Array.isArray(value)) {
        walk(value, path);
      } else {
        lines.push(`• \`${path}\` = \`${value}\``);
      }
    }
  }

  walk(thresholds);

  return lines.join('\n') || 'No thresholds found.';
}

module.exports = {
  name: 'thresholds',
  aliases: ['thresh', 'limits', 'limit'],
  category: 'security',
  description: 'View, change, or reset Rumi security thresholds.',
  usage: 'thresholds <view|set|reset> [path] [value]',
  examples: [
    'thresholds view',
    'thresholds set antiRaid.joinCount 8',
    'thresholds set antiNuke.channelDeletes 3',
    'thresholds reset'
  ],
  subcommands: [
    {
      name: 'view',
      usage: 'thresholds view',
      description: 'Show current thresholds.'
    },
    {
      name: 'set',
      usage: 'thresholds set <path> <number>',
      description: 'Set one threshold value.'
    },
    {
      name: 'reset',
      usage: 'thresholds reset',
      description: 'Restore default thresholds.'
    }
  ],
  guildOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ message, args }) {
    const subcommand = (args.shift() || 'view').toLowerCase();
    const settings = await db.getGuildSettings(message.guild.id);
    const current = clone(settings.thresholds_json || DEFAULT_THRESHOLDS);

    if (subcommand === 'view') {
      return respond.reply(message, 'list', `current thresholds:\n\n${formatThresholds(current)}`);
    }

    if (subcommand === 'reset') {
      await db.updateGuildSettings(message.guild.id, {
        thresholds_json: DEFAULT_THRESHOLDS
      });

      return respond.reply(message, 'good', 'I reset this server’s thresholds to the defaults.');
    }

    if (subcommand === 'set') {
      const path = args.shift();
      const rawValue = args.shift();

      if (!path || rawValue === undefined) {
        return respond.reply(message, 'info', 'I use it like this: `thresholds set <path> <number>`. Example: `thresholds set antiRaid.joinCount 8`.');
      }

      if (getNested(DEFAULT_THRESHOLDS, path) === undefined) {
        return respond.reply(message, 'bad', `\`${path}\` is not a valid threshold path.`);
      }

      const value = Number(rawValue);

      if (!Number.isFinite(value) || value < 0) {
        return respond.reply(message, 'bad', 'Threshold value must be a positive number.');
      }

      setNested(current, path, value);

      await db.updateGuildSettings(message.guild.id, {
        thresholds_json: current
      });

      return respond.reply(message, 'good', `I set \`${path}\` to \`${value}\`.`);
    }

    return respond.reply(message, 'bad', `Unknown thresholds subcommand \`${subcommand}\`.`);
  }
};