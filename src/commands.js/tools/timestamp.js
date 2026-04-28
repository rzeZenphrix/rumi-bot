const respond = require('../../utils/respond');

function toUnixSeconds(input) {
  if (!input) return Math.floor(Date.now() / 1000);

  const numeric = Number(input);
  if (Number.isFinite(numeric)) {
    if (String(Math.trunc(numeric)).length >= 13) return Math.floor(numeric / 1000);
    return Math.floor(numeric);
  }

  const parsed = Date.parse(input);
  if (Number.isNaN(parsed)) return null;
  return Math.floor(parsed / 1000);
}

module.exports = {
  name: 'timestamp',
  aliases: ['ts'],
  category: 'tools',
  description: 'Create Discord timestamp formats from now, a unix time, or a date string.',
  usage: 'timestamp [unix|date text]',
  examples: ['timestamp', 'timestamp 1714359600', 'timestamp 2026-05-01 18:30 UTC'],

  async execute({ message, args }) {
    const input = args.join(' ').trim();
    const unix = toUnixSeconds(input);

    if (!unix) {
      return respond.reply(message, 'bad', 'I could not turn that into a timestamp.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `Built Discord timestamps for **${unix}**.`,
      fields: [
        { name: 'Short Time', value: `<t:${unix}:t>`, inline: true },
        { name: 'Long Time', value: `<t:${unix}:T>`, inline: true },
        { name: 'Short Date', value: `<t:${unix}:d>`, inline: true },
        { name: 'Long Date', value: `<t:${unix}:D>`, inline: true },
        { name: 'Date & Time', value: `<t:${unix}:f>`, inline: true },
        { name: 'Full Date & Time', value: `<t:${unix}:F>`, inline: true },
        { name: 'Relative', value: `<t:${unix}:R>`, inline: true },
        { name: 'Raw', value: `\`<t:${unix}:F>\`` }
      ]
    });
  }
};
