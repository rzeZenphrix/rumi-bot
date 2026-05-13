const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');
const {
  getGlobalCustomization
} = require('../../systems/customization/customizationStore');
const {
  savePresence,
  saveStatsPresence,
  setPresenceEverywhere,
  normalizeStatus,
  normalizeActivityType
} = require('../../systems/customization/presenceManager');

module.exports = {
  name: 'presence',
  aliases: ['setpresence', 'botpresence'],
  category: 'config',
  description: 'View or update Rumi global presence settings.',
  usage: 'presence <view|set|stats|off> ...',
  examples: [
    'presence view',
    'presence set online watching over your server',
    'presence set idle playing with moderation',
    'presence stats on Watching {servers} servers',
    'presence off'
  ],
  ownerOnly: true,
  permissions: [PermissionFlagsBits.Administrator],

  async execute({ client, message, args }) {
    const sub = String(args.shift() || 'view').toLowerCase();

    if (sub === 'view') {
      const global = getGlobalCustomization();
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Rumi Presence',
        fields: [
          { name: 'Status', value: global.presence?.status || 'online', inline: true },
          { name: 'Activity type', value: global.presence?.activityType || 'watching', inline: true },
          { name: 'Activity text', value: global.presence?.activityText || 'over your server', inline: false },
          { name: 'Stats presence', value: global.stats?.enabled ? 'enabled' : 'disabled', inline: true },
          { name: 'Stats format', value: global.stats?.format || 'Watching {servers} servers', inline: false }
        ]
      });
    }

    if (sub === 'off' || sub === 'disable') {
      await saveStatsPresence({ enabled: false });
      await savePresence({
        status: 'online',
        activityType: 'watching',
        activityText: 'over your server'
      });
      await setPresenceEverywhere(client, {
        status: 'online',
        activityType: 'watching',
        activityText: 'over your server'
      }).catch(() => null);
      return respond.reply(message, 'good', 'I reset the live presence back to the default Rumi status.');
    }

    if (sub === 'stats') {
      const mode = String(args.shift() || '').toLowerCase();
      const format = args.join(' ').trim() || 'Watching {servers} servers';
      const enabled = ['on', 'enable', 'enabled', 'true'].includes(mode);

      if (!['on', 'off', 'enable', 'disable', 'enabled', 'disabled', 'true', 'false'].includes(mode)) {
        return respond.reply(message, '', '> presence stats <on|off> [format]');
      }

      await saveStatsPresence({ enabled, format });
      if (enabled) {
        await setPresenceEverywhere(client, {
          status: getGlobalCustomization().presence?.status || 'online',
          activityType: 'watching',
          activityText: format
        }).catch(() => null);
      }

      return respond.reply(message, 'good', `Stats presence is now ${enabled ? 'enabled' : 'disabled'}.`);
    }

    if (sub === 'set') {
      const status = String(args.shift() || '').toLowerCase();
      const activityType = String(args.shift() || '').toLowerCase();
      const activityText = args.join(' ').trim();

      if (!status || !activityType || !activityText) {
        return respond.reply(message, '', '> Use `presence set <online|idle|dnd|invisible> <watching|playing|listening|streaming|competing> <text>`.');
      }

       if (normalizeStatus(status) !== status) {
        return respond.reply(message, '', '-# Use a valid status: online, idle, dnd, or invisible.');
      }

      if (!['playing', 'streaming', 'listening', 'watching', 'competing'].includes(activityType) || normalizeActivityType(activityType) === undefined) {
        return respond.reply(message, '', '-# Use a valid activity type: watching, playing, listening, streaming, or competing.');
      }

      await saveStatsPresence({ enabled: false });
      await savePresence({ status, activityType, activityText });
      const applied = await setPresenceEverywhere(client, { status, activityType, activityText }).catch(() => false);

      return respond.reply(
        message,
        applied ? 'good' : 'alert',
        applied
          ? 'I updated the live Rumi presence.'
          : 'I saved the new presence, but I could not apply it live right now.'
      );
    }

    return respond.reply(message, '', '-# Use\n```presence view`, `presence set`, `presence stats`, or `presence off````');
  }
};
