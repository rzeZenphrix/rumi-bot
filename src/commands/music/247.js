const respond = require('../../utils/respond');
const { setStay247, getGuildSettings } = require('../../systems/music/musicExtras');

function plain(message, type, text) {
  return respond.reply(message, type, text, {
    plain: true,
    useWebhook: false,
    allowedMentions: { parse: [] }
  });
}

module.exports = {
  name: '247',
  aliases: ['24/7', 'stay', 'stayvc', 'stayvoice'],
  category: 'music',
  description: 'Keep music connected after the queue ends.',
  usage: '247 <on|off|status>',
  examples: ['247 on', '247 off'],
  guildOnly: true,

  async execute({ message, args }) {
    const mode = String(args.shift() || 'status').toLowerCase();

    if (mode === 'status') {
      const settings = await getGuildSettings(message.guild.id);
      return plain(message, 'info', `24/7 mode is ${settings.stay247 ? 'on' : 'off'}.`);
    }

    if (!['on', 'off', 'enable', 'disable', 'true', 'false'].includes(mode)) {
      return plain(message, 'info', 'Usage: `247 <on|off|status>`.');
    }

    const enabled = ['on', 'enable', 'true'].includes(mode);

    await setStay247(message.guild.id, enabled, message.author.id);

    return plain(message, 'good', `24/7 mode is now ${enabled ? 'on' : 'off'}.`);
  }
};