const respond = require('../../utils/respond');

module.exports = {
  name: 'stocks',
  aliases: ['stock'],
  category: 'utility',
  description: 'Stock price lookup.',
  usage: 'stocks <symbol>',

  async execute({ message, args }) {
    const symbol = String(args[0] || '').trim().toUpperCase();
    if (!symbol) return respond.reply(message, 'info', 'Use `stocks <symbol>`.');

    const payload = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`)
      .then((res) => res.json())
      .catch(() => null);

    const quote = payload?.quoteResponse?.result?.[0];
    if (!quote) return respond.reply(message, 'bad', `I could not find a stock quote for \`${symbol}\`.`);

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `**${quote.longName || quote.shortName || symbol}**\n**Price:** \`$${quote.regularMarketPrice}\`\n**Change:** \`${Number(quote.regularMarketChangePercent || 0).toFixed(2)}%\`\n**Market:** \`${quote.fullExchangeName || 'Unknown'}\``
    });
  }
};
