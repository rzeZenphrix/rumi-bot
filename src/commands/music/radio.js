const respond = require('../../utils/respond');
const { RADIOS, playQuery, recordMusicPlay } = require('../../systems/music/musicExtras');

function plain(message, type, text) {
  return respond.reply(message, type, text, {
    plain: true,
    useWebhook: false,
    allowedMentions: { parse: [] }
  });
}

module.exports = {
  name: 'radio',
  aliases: ['station'],
  category: 'music',
  description: 'Start a preset music radio.',
  usage: 'radio [station]',
  examples: ['radio', 'radio lofi', 'radio anime'],
  guildOnly: true,
  typing: true,

  async execute({ message, args }) {
    const station = String(args.shift() || '').toLowerCase();

    if (!station || station === 'list') {
      return plain(message, 'info', `Radio stations: ${Object.keys(RADIOS).map((x) => `\`${x}\``).join(', ')}`);
    }

    const query = RADIOS[station];

    if (!query) {
      return plain(message, 'bad', 'Unknown station. Use `radio list`.');
    }

    const payload = await playQuery(message, query, 'radio');

    if (!payload?.ok) {
      return plain(message, 'bad', payload?.error || 'Could not start radio.');
    }

    await recordMusicPlay(message.guild.id, message.author.id, {
      type: 'radio',
      radio: station,
      query
    }).catch(() => null);

    return plain(message, 'good', `Started ${station} radio.`);
  }
};