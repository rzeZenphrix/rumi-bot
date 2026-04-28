const respond = require('../../utils/respond');
const { createPagedMessage } = require('../../utils/pagedMessages');

function parseSymbols(args) {
  return [...new Set(
    args
      .join(' ')
      .split(/[,\s]+/)
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
  )].slice(0, 5);
}

module.exports = {
  name: 'stocks',
  aliases: ['stock'],
  category: 'utility',
  description: 'Look up one or more stock quotes in a paged view.',
  usage: 'stocks <symbol[,symbol...]>',
  examples: ['stocks nvda', 'stocks aapl msft tsla'],
  typing: true,

  async execute({ message, args }) {
    const symbols = parseSymbols(args);
    if (!symbols.length) return respond.reply(message, 'info', 'Use `stocks <symbol>` or `stocks aapl msft`.');

    const payload = await fetch(`https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols.join(','))}`)
      .then((res) => res.json())
      .catch(() => null);

    const results = payload?.quoteResponse?.result || [];
    if (!results.length) return respond.reply(message, 'bad', 'I could not find any stock quotes for that request.');

    const pages = results.map((quote) => {
      const price = quote.regularMarketPrice ?? 'unknown';
      const changeValue = Number(quote.regularMarketChange || 0);
      const changePercent = Number(quote.regularMarketChangePercent || 0);
      const arrow = changeValue >= 0 ? '▲' : '▼';

      return {
        title: `${quote.symbol} | ${quote.longName || quote.shortName || quote.symbol}`,
        allowTitle: true,
        description: `**Price:** \`${price}\`\n**Change:** \`${arrow} ${changeValue.toFixed(2)} (${changePercent.toFixed(2)}%)\`\n**Exchange:** \`${quote.fullExchangeName || 'Unknown'}\``,
        fields: [
          { name: 'Open', value: String(quote.regularMarketOpen ?? 'unknown'), inline: true },
          { name: 'Day range', value: `${quote.regularMarketDayLow ?? '—'} - ${quote.regularMarketDayHigh ?? '—'}`, inline: true },
          { name: '52W range', value: `${quote.fiftyTwoWeekLow ?? '—'} - ${quote.fiftyTwoWeekHigh ?? '—'}`, inline: true },
          { name: 'Volume', value: String(quote.regularMarketVolume ?? 'unknown'), inline: true },
          { name: 'Market cap', value: String(quote.marketCap ?? 'unknown'), inline: true },
          { name: 'Currency', value: quote.currency || 'unknown', inline: true }
        ]
      };
    });

    const paged = createPagedMessage({
      prefix: 'stocks',
      ownerId: message.author.id,
      guildId: message.guild?.id,
      type: 'info',
      pages
    });

    return respond.reply(message, 'info', null, paged);
  }
};
