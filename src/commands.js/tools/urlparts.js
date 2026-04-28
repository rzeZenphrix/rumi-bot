const respond = require('../../utils/respond');

module.exports = {
  name: 'urlparts',
  aliases: ['urlparse', 'parseurl'],
  category: 'tools',
  description: 'Break a URL into host, path, query, and hash parts.',
  usage: 'urlparts <url>',
  examples: ['urlparts https://example.com/docs?q=rumi#api'],

  async execute({ message, args }) {
    const input = args.join(' ').trim();
    if (!input) {
      return respond.reply(message, 'info', 'Use `urlparts <url>`.');
    }

    let parsed;
    try {
      parsed = new URL(input);
    } catch {
      return respond.reply(message, 'bad', 'I need a valid URL.');
    }

    const params = [...parsed.searchParams.entries()]
      .slice(0, 10)
      .map(([key, value]) => `\`${key}\` = ${value || '*empty*'}`)
      .join('\n') || 'None';

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `Parsed **${parsed.hostname}**.`,
      fields: [
        { name: 'Origin', value: parsed.origin, inline: true },
        { name: 'Protocol', value: parsed.protocol, inline: true },
        { name: 'Host', value: parsed.host, inline: true },
        { name: 'Pathname', value: parsed.pathname || '/', inline: true },
        { name: 'Hash', value: parsed.hash || 'None', inline: true },
        { name: 'Search', value: parsed.search || 'None', inline: true },
        { name: 'Query Parameters', value: params }
      ]
    });
  }
};
