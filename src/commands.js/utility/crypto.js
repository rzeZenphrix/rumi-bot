const respond = require('../../utils/respond');
const { requireUserPremium } = require('../../systems/monetization/access');
const { listAlerts, removeAlert, upsertAlert } = require('../../systems/monetization/marketAlerts');

function formatMoney(value) {
  if (!Number.isFinite(Number(value))) return 'Unknown';
  return new Intl.NumberFormat('en-US', {
    notation: Number(value) >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: 2
  }).format(Number(value));
}

module.exports = {
  name: 'crypto',
  aliases: ['coinprice'],
  category: 'utility',
  description: 'Look up cryptocurrency prices and market info.',
  usage: 'crypto <symbol|coin> | crypto <subscribe|unsubscribe|subscriptions> ...',
  examples: ['crypto btc', 'crypto ethereum', 'crypto subscribe btc', 'crypto subscriptions'],
  typing: true,

  async execute({ message, args }) {
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'subscriptions') {
      const access = await requireUserPremium(message, 'Crypto alerts').catch(() => null);
      if (!access) return null;

      const alerts = await listAlerts(message.author.id, 'crypto');
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: alerts.length
          ? `**Crypto alerts**\n${alerts.map((entry, index) => `${index + 1}. \`${entry.displayName || entry.symbol}\``).join('\n')}`
          : 'You do not have any crypto alerts saved.'
      });
    }

    if (sub === 'subscribe' || sub === 'unsubscribe') {
      const access = await requireUserPremium(message, 'Crypto alerts').catch(() => null);
      if (!access) return null;
      args.shift();
      const query = args.join(' ').trim().toLowerCase();
      if (!query) {
        return respond.reply(message, 'info', `Use \`crypto ${sub} <symbol|coin>\`.`);
      }

      if (sub === 'unsubscribe') {
        const alerts = await listAlerts(message.author.id, 'crypto');
        const existing = alerts.find((entry) =>
          String(entry.symbol || '').toLowerCase() === query ||
          String(entry.coinId || '').toLowerCase() === query ||
          String(entry.displayName || '').toLowerCase() === query
        );
        if (!existing) {
          return respond.reply(message, 'bad', 'I could not find a saved crypto alert by that name.');
        }
        await removeAlert('crypto', message.author.id, existing.symbol);
        return respond.reply(message, 'good', `Removed the crypto alert for **${existing.displayName || existing.symbol}**.`);
      }
    }

    const query = args.join(' ').trim().toLowerCase();
    if (!query) {
      return respond.reply(message, 'info', 'Use `crypto <symbol|coin>`.');
    }

    const search = await fetch(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .catch(() => null);

    const coin = search?.coins?.[0];
    if (!coin) {
      return respond.reply(message, 'bad', 'I could not find that coin.');
    }

    if (sub === 'subscribe') {
      await upsertAlert({
        type: 'crypto',
        userId: message.author.id,
        symbol: String(coin.symbol || '').toUpperCase(),
        coinId: coin.id,
        displayName: coin.name
      });
      return respond.reply(message, 'good', `Saved a daily crypto alert for **${coin.name} (${String(coin.symbol || '').toUpperCase()})**.`);
    }

    const market = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(coin.id)}`)
      .then((res) => res.json())
      .catch(() => null);

    const row = market?.[0];
    if (!row) {
      return respond.reply(message, 'bad', 'Crypto market data is unavailable right now.');
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: `${row.name} (${String(row.symbol || '').toUpperCase()})`,
      thumbnail: row.image,
      description: [
        `**Price:** \`$${formatMoney(row.current_price)}\``,
        `**24h Change:** \`${Number(row.price_change_percentage_24h || 0).toFixed(2)}%\``,
        `**Market Cap:** \`$${formatMoney(row.market_cap)}\``,
        `**Last Updated:** <t:${Math.floor(new Date(row.last_updated).getTime() / 1000)}:R>`
      ].join('\n')
    });
  }
};
