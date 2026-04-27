const respond = require('../../utils/respond');
const { requireUserPremium } = require('../../systems/monetization/access');
const { listAlerts, removeAlert, upsertAlert } = require('../../systems/monetization/marketAlerts');

async function fetchRates(base) {
  return fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`)
    .then((res) => res.json())
    .catch(() => null);
}

module.exports = {
  name: 'currency',
  aliases: ['convert'],
  category: 'utility',
  description: 'Convert currencies and manage daily currency alerts.',
  usage: 'currency <amount> <from> <to> | currency <subscribe|unsubscribe|subscriptions> ...',
  examples: ['currency 10 usd eur', 'currency subscribe usd eur', 'currency subscriptions'],
  typing: true,

  async execute({ message, args }) {
    const sub = String(args[0] || '').toLowerCase();

    if (sub === 'subscriptions') {
      const access = await requireUserPremium(message, 'Currency alerts').catch(() => null);
      if (!access) return null;

      const alerts = await listAlerts(message.author.id, 'currency');
      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: alerts.length
          ? `**Currency alerts**\n${alerts.map((entry, index) => `${index + 1}. \`${entry.base}/${entry.quote}\``).join('\n')}`
          : 'You do not have any currency alerts saved.'
      });
    }

    if (sub === 'subscribe' || sub === 'unsubscribe') {
      const access = await requireUserPremium(message, 'Currency alerts').catch(() => null);
      if (!access) return null;

      const base = String(args[1] || '').toUpperCase();
      const quote = String(args[2] || '').toUpperCase();
      if (!base || !quote) {
        return respond.reply(message, 'info', `Use \`currency ${sub} <from> <to>\`.`);
      }

      if (sub === 'unsubscribe') {
        const removed = await removeAlert('currency', message.author.id, `${base}-${quote}`);
        if (!removed) return respond.reply(message, 'bad', 'I could not find that saved currency alert.');
        return respond.reply(message, 'good', `Removed the currency alert for **${base}/${quote}**.`);
      }

      const data = await fetchRates(base);
      const rate = data?.rates?.[quote];
      if (!rate) return respond.reply(message, 'bad', 'I could not validate that currency pair.');

      await upsertAlert({
        type: 'currency',
        userId: message.author.id,
        symbol: `${base}-${quote}`,
        base,
        quote
      });
      return respond.reply(message, 'good', `Saved a daily currency alert for **${base}/${quote}**.`);
    }

    const amount = Number(args.shift());
    const from = String(args.shift() || '').toUpperCase();
    const to = String(args.shift() || '').toUpperCase();
    if (!Number.isFinite(amount) || !from || !to) {
      return respond.reply(message, 'info', 'Use `currency <amount> <from> <to>`.');
    }

    const data = await fetchRates(from);
    const rate = data?.rates?.[to];
    if (!rate) {
      return respond.reply(message, 'bad', 'I could not get that exchange rate.');
    }

    return respond.reply(message, 'info', null, {
      description: `**Currency**\n\`${amount} ${from}\` ~= **${(amount * rate).toFixed(2)} ${to}**\nRate: \`${rate}\``
    });
  }
};
