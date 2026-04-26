const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  savePresence,
  saveStatsPresence,
  applySavedPresence
} = require('../../systems/customization/presenceManager');
const { getGlobalCustomization } = require('../../systems/customization/customizationStore');

module.exports = {
  name: 'presence',
  aliases: ['status', 'activity', 'botstatus'],
  category: 'config',
  description: 'Customize my global status, stats status, and activity text.',
  usage: 'presence <view|set|stats|clear>',
  examples: [
    'presence view',
    'presence set online watching over your server',
    'presence set idle listening to commands',
    'presence stats on Watching {servers} servers',
    'presence stats off'
  ],
  subcommands: [
    { name: 'view', description: 'Shows my current presence configuration.', usage: 'view' },
    { name: 'set', description: 'Sets my custom status/activity.', usage: 'set <online|idle|dnd|invisible> <playing|watching|listening|competing> <text>' },
    { name: 'stats', description: 'Toggles stats-based presence.', usage: 'stats <on|off> [format]' },
    { name: 'clear', description: 'Restores my default presence.', usage: 'clear' }
  ],
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ client, message, args }) {
    const sub = (args.shift() || 'view').toLowerCase();

    if (sub === 'view') {
      const cfg = getGlobalCustomization();

      return respond.reply(message, 'info', null, {
        description: 'I found my current global presence setup.',
        fields: [
          {
            name: 'Presence',
            value: [
              `Status: \`${cfg.presence?.status || 'online'}\``,
              `Activity type: \`${cfg.presence?.activityType || 'Watching'}\``,
              `Activity text: \`${cfg.presence?.activityText || 'over your server'}\``
            ].join('\n')
          },
          {
            name: 'Stats mode',
            value: [
              `Enabled: \`${Boolean(cfg.stats?.enabled)}\``,
              `Format: \`${cfg.stats?.format || 'Watching {servers} servers'}\``
            ].join('\n')
          }
        ]
      });
    }

    if (sub === 'set') {
      const status = args.shift();
      const activityType = args.shift();
      const activityText = args.join(' ').trim();

      if (!status || !activityType || !activityText) {
        return respond.reply(message, 'info', 'need `presence set <status> <activityType> <text>`.');
      }

      savePresence({ status, activityType, activityText });
      await applySavedPresence(client);

      return respond.reply(message, 'good', 'updated my global presence.');
    }

    if (sub === 'stats') {
      const toggle = (args.shift() || '').toLowerCase();

      if (!['on', 'off'].includes(toggle)) {
        return respond.reply(message, 'info', 'need `presence stats <on|off> [format]`.');
      }

      saveStatsPresence({
        enabled: toggle === 'on',
        format: args.join(' ').trim() || 'Watching {servers} servers'
      });

      await applySavedPresence(client);

      return respond.reply(message, 'good', `${toggle === 'on' ? 'enabled' : 'disabled'} stats presence.`);
    }

    if (sub === 'clear') {
      savePresence({
        status: 'online',
        activityType: 'Watching',
        activityText: 'over your server'
      });

      await applySavedPresence(client);

      return respond.reply(message, 'good', 'restored my default presence.');
    }

    return respond.reply(message, 'bad', `do not know the presence action \`${sub}\`.`);
  }
};