const respond = require('../../utils/respond');
const { requireUserPremium } = require('../../systems/monetization/access');
const { listAlerts, removeAlert, upsertAlert } = require('../../systems/monetization/marketAlerts');

const CURRENCY_ALIASES = {
  usd: ['usd', 'dollar', 'dollars', 'us dollar', 'us dollars', '$'],
  eur: ['eur', 'euro', 'euros', '€'],
  gbp: ['gbp', 'pound', 'pounds', 'sterling', 'british pound', '£'],
  jpy: ['jpy', 'yen', 'japanese yen', '¥'],
  cad: ['cad', 'canadian dollar', 'canadian dollars'],
  aud: ['aud', 'australian dollar', 'australian dollars'],
  ngn: ['ngn', 'naira', 'nigerian naira'],
  zar: ['zar', 'rand', 'south african rand'],
  inr: ['inr', 'rupee', 'rupees', 'indian rupee'],
  cny: ['cny', 'yuan', 'renminbi', 'rmb'],
  chf: ['chf', 'swiss franc', 'swiss francs'],
  sek: ['sek', 'swedish krona', 'krona'],
  nok: ['nok', 'norwegian krone'],
  dkk: ['dkk', 'danish krone'],
  sgd: ['sgd', 'singapore dollar'],
  hkd: ['hkd', 'hong kong dollar'],
  aed: ['aed', 'dirham', 'uae dirham'],
  brl: ['brl', 'real', 'brazilian real'],
  mxn: ['mxn', 'peso', 'mexican peso'],
  krw: ['krw', 'won', 'korean won']
};

const aliasLookup = new Map();
for (const [code, aliases] of Object.entries(CURRENCY_ALIASES)) {
  for (const alias of aliases) {
    aliasLookup.set(alias.toLowerCase(), code.toUpperCase());
  }
}

async function fetchRates(base) {
  return fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`)
    .then((res) => res.json())
    .catch(() => null);
}

function normalizeCurrency(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return '';
  if (aliasLookup.has(raw)) return aliasLookup.get(raw);
  const compact = raw.replace(/[_-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (aliasLookup.has(compact)) return aliasLookup.get(compact);
  if (/^[a-z]{3}$/.test(raw)) return raw.toUpperCase();
  return '';
}

function parseConvertArgs(args) {
  const cleaned = args
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => entry.toLowerCase() !== 'to');

  if (!cleaned.length) return null;

  let amount = Number(cleaned[0].replace(/,/g, ''));
  let cursor = 0;
  if (Number.isFinite(amount)) {
    cursor = 1;
  } else {
    amount = 1;
  }

  const remaining = cleaned.slice(cursor);
  if (remaining.length < 2) return null;

  const from = normalizeCurrency(remaining[0]);
  const to = normalizeCurrency(remaining[1]);
  if (!from || !to) return null;

  return {
    amount,
    from,
    to
  };
}

function formatList(rates, limit = 10) {
  return Object.entries(rates || {})
    .slice(0, limit)
    .map(([code, rate]) => `${code}: **${Number(rate).toFixed(4)}**`)
    .join('\n');
}

module.exports = {
  name: 'currency',
  aliases: ['convert', 'fx', 'exchange'],
  category: 'utility',
  description: 'Convert currencies, compare rates, inspect codes, and manage daily currency alerts.',
  usage: 'currency <amount?> <from> <to> | currency <info|list|compare|subscribe|unsubscribe|subscriptions> ...',
  examples: ['currency 10 usd eur', 'currency dollars pounds', 'currency info gbp', 'currency compare usd eur gbp', 'currency subscribe usd eur'],
  typing: true,
  subcommands: [
    { name: 'subscriptions', description: 'List your saved daily currency alerts.', usage: 'currency subscriptions', examples: ['currency subscriptions'], premium: { scope: 'user' } },
    { name: 'subscribe', description: 'Save a daily currency alert.', usage: 'currency subscribe <from> <to>', examples: ['currency subscribe usd eur'], premium: { scope: 'user' } },
    { name: 'unsubscribe', description: 'Remove a saved daily currency alert.', usage: 'currency unsubscribe <from> <to>', examples: ['currency unsubscribe usd eur'], premium: { scope: 'user' } },
    { name: 'info', description: 'Inspect a currency code and some quick aliases.', usage: 'currency info <code|name>', examples: ['currency info pounds'] },
    { name: 'list', description: 'List the top rates for a base currency.', usage: 'currency list <base>', examples: ['currency list usd'] },
    { name: 'compare', description: 'Compare one base currency against multiple outputs.', usage: 'currency compare <base> <quote> [quote...]', examples: ['currency compare usd eur gbp ngn'] }
  ],

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

      const base = normalizeCurrency(args[1]);
      const quote = normalizeCurrency(args[2]);
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

    if (sub === 'info') {
      const code = normalizeCurrency(args[1]);
      if (!code) return respond.reply(message, 'info', 'Use `currency info <code|name>`.');
      return respond.reply(message, 'info', null, {
        description: `**${code}**\nAliases: ${(CURRENCY_ALIASES[code.toLowerCase()] || [code]).map((alias) => `\`${alias}\``).join(', ')}`
      });
    }

    if (sub === 'list') {
      const base = normalizeCurrency(args[1]);
      if (!base) return respond.reply(message, 'info', 'Use `currency list <base>`.');
      const data = await fetchRates(base);
      if (!data?.rates) return respond.reply(message, 'bad', 'I could not fetch rates for that base currency.');
      return respond.reply(message, 'info', null, {
        description: `**${base} rates**\n${formatList(data.rates, 12)}`
      });
    }

    if (sub === 'compare') {
      const base = normalizeCurrency(args[1]);
      const quotes = args.slice(2).map(normalizeCurrency).filter(Boolean);
      if (!base || quotes.length < 1) {
        return respond.reply(message, 'info', 'Use `currency compare <base> <quote> [quote...]`.');
      }
      const data = await fetchRates(base);
      if (!data?.rates) return respond.reply(message, 'bad', 'I could not fetch rates for that base currency.');
      const lines = quotes
        .filter((code, index, list) => list.indexOf(code) === index)
        .map((code) => `${base}/${code}: **${Number(data.rates?.[code] || 0).toFixed(4)}**`)
        .filter((line) => !line.endsWith('0.0000**'));
      if (!lines.length) return respond.reply(message, 'bad', 'I could not resolve any of those target currencies.');
      return respond.reply(message, 'info', null, {
        description: `**Currency compare**\n${lines.join('\n')}`
      });
    }

    const parsed = parseConvertArgs(args);
    if (!parsed) {
      return respond.reply(message, 'info', 'Use `currency <amount?> <from> <to>`, `currency info <code>`, `currency list <base>`, or `currency compare <base> <quote> [quote...]`.');
    }

    const data = await fetchRates(parsed.from);
    const rate = data?.rates?.[parsed.to];
    if (!rate) {
      return respond.reply(message, 'bad', 'I could not get that exchange rate.');
    }

    const converted = parsed.amount * Number(rate);
    return respond.reply(message, 'info', null, {
      description: [
        '**Currency**',
        `**${parsed.amount.toLocaleString()} ${parsed.from}** ~= **${converted.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${parsed.to}**`,
        `Rate: \`${Number(rate).toFixed(6)}\``,
        `Tip: I also understand names like \`dollars\`, \`pounds\`, \`euro\`, \`naira\`, and \`yen\`.`
      ].join('\n')
    });
  }
};
