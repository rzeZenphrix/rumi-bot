require('dotenv').config();

const { PermissionFlagsBits } = require('discord.js');
const respond = require('../../utils/respond');

const CACHE_TTL = 1000 * 60 * 30;
const RATE_CACHE = new Map();
let currencyListCache = null;
let currencyListCacheAt = 0;

const POPULAR_CODES = [
  'USD', 'EUR', 'GBP', 'NGN', 'GHS', 'KES', 'ZAR', 'UGX',
  'TZS', 'CAD', 'AUD', 'JPY', 'CNY', 'INR', 'AED', 'SAR'
];

const SYMBOLS = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CNY: '¥',
  NGN: '₦',
  GHS: '₵',
  KES: 'KSh',
  UGX: 'USh',
  TZS: 'TSh',
  ZAR: 'R',
  INR: '₹',
  KRW: '₩',
  RUB: '₽',
  TRY: '₺',
  PHP: '₱',
  VND: '₫',
  THB: '฿',
  ILS: '₪',
  AED: 'د.إ',
  SAR: '﷼'
};

const SYMBOL_ALIASES = {
  '$': 'USD',
  '€': 'EUR',
  '£': 'GBP',
  '¥': 'JPY',
  '₦': 'NGN',
  '₵': 'GHS',
  '₹': 'INR',
  '₩': 'KRW',
  '₽': 'RUB',
  '₺': 'TRY',
  '₱': 'PHP',
  '₫': 'VND',
  '฿': 'THB',
  '₪': 'ILS'
};

const CURRENCY_ALIASES = {
  usd: 'USD',
  dollar: 'USD',
  dollars: 'USD',
  buck: 'USD',
  bucks: 'USD',
  us: 'USD',
  'us-dollar': 'USD',
  'american-dollar': 'USD',

  eur: 'EUR',
  euro: 'EUR',
  euros: 'EUR',

  gbp: 'GBP',
  pound: 'GBP',
  pounds: 'GBP',
  sterling: 'GBP',
  quid: 'GBP',
  'british-pound': 'GBP',

  ngn: 'NGN',
  naira: 'NGN',
  nigerian: 'NGN',
  'nigerian-naira': 'NGN',

  ghs: 'GHS',
  cedi: 'GHS',
  cedis: 'GHS',
  ghana: 'GHS',
  'ghana-cedi': 'GHS',
  'ghanaian-cedi': 'GHS',

  kes: 'KES',
  ksh: 'KES',
  'kenyan-shilling': 'KES',
  'kenya-shilling': 'KES',

  ugx: 'UGX',
  ush: 'UGX',
  'ugandan-shilling': 'UGX',

  tzs: 'TZS',
  tsh: 'TZS',
  'tanzanian-shilling': 'TZS',

  zar: 'ZAR',
  rand: 'ZAR',
  'south-african-rand': 'ZAR',

  cad: 'CAD',
  canadian: 'CAD',
  'canadian-dollar': 'CAD',

  aud: 'AUD',
  australian: 'AUD',
  'australian-dollar': 'AUD',

  jpy: 'JPY',
  yen: 'JPY',
  japanese: 'JPY',
  'japanese-yen': 'JPY',

  cny: 'CNY',
  yuan: 'CNY',
  rmb: 'CNY',
  chinese: 'CNY',
  'chinese-yuan': 'CNY',

  inr: 'INR',
  rupee: 'INR',
  rupees: 'INR',
  indian: 'INR',
  'indian-rupee': 'INR',

  aed: 'AED',
  dirham: 'AED',
  'uae-dirham': 'AED',

  sar: 'SAR',
  riyal: 'SAR',
  'saudi-riyal': 'SAR',

  chf: 'CHF',
  franc: 'CHF',
  francs: 'CHF',
  'swiss-franc': 'CHF',

  sek: 'SEK',
  krona: 'SEK',
  'swedish-krona': 'SEK',

  nok: 'NOK',
  'norwegian-krone': 'NOK',

  dkk: 'DKK',
  'danish-krone': 'DKK',

  mxn: 'MXN',
  peso: 'MXN',
  pesos: 'MXN',
  'mexican-peso': 'MXN',

  brl: 'BRL',
  real: 'BRL',
  reais: 'BRL',
  'brazilian-real': 'BRL',

  php: 'PHP',
  'philippine-peso': 'PHP',

  try: 'TRY',
  lira: 'TRY',
  'turkish-lira': 'TRY',

  ils: 'ILS',
  shekel: 'ILS',

  rub: 'RUB',
  ruble: 'RUB',
  rouble: 'RUB',

  krw: 'KRW',
  won: 'KRW',

  hkd: 'HKD',
  'hong-kong-dollar': 'HKD',

  sgd: 'SGD',
  'singapore-dollar': 'SGD',

  nzd: 'NZD',
  'new-zealand-dollar': 'NZD'
};

const STATIC_NAMES = {
  AED: 'United Arab Emirates Dirham',
  AFN: 'Afghan Afghani',
  ALL: 'Albanian Lek',
  AMD: 'Armenian Dram',
  ANG: 'Netherlands Antillean Guilder',
  AOA: 'Angolan Kwanza',
  ARS: 'Argentine Peso',
  AUD: 'Australian Dollar',
  AWG: 'Aruban Florin',
  AZN: 'Azerbaijani Manat',
  BAM: 'Bosnia-Herzegovina Convertible Mark',
  BBD: 'Barbadian Dollar',
  BDT: 'Bangladeshi Taka',
  BGN: 'Bulgarian Lev',
  BHD: 'Bahraini Dinar',
  BIF: 'Burundian Franc',
  BMD: 'Bermudian Dollar',
  BND: 'Brunei Dollar',
  BOB: 'Bolivian Boliviano',
  BRL: 'Brazilian Real',
  BSD: 'Bahamian Dollar',
  BTN: 'Bhutanese Ngultrum',
  BWP: 'Botswana Pula',
  BYN: 'Belarusian Ruble',
  BZD: 'Belize Dollar',
  CAD: 'Canadian Dollar',
  CDF: 'Congolese Franc',
  CHF: 'Swiss Franc',
  CLP: 'Chilean Peso',
  CNY: 'Chinese Yuan',
  COP: 'Colombian Peso',
  CRC: 'Costa Rican Colón',
  CUP: 'Cuban Peso',
  CVE: 'Cape Verdean Escudo',
  CZK: 'Czech Koruna',
  DJF: 'Djiboutian Franc',
  DKK: 'Danish Krone',
  DOP: 'Dominican Peso',
  DZD: 'Algerian Dinar',
  EGP: 'Egyptian Pound',
  ERN: 'Eritrean Nakfa',
  ETB: 'Ethiopian Birr',
  EUR: 'Euro',
  FJD: 'Fijian Dollar',
  FKP: 'Falkland Islands Pound',
  GBP: 'British Pound Sterling',
  GEL: 'Georgian Lari',
  GGP: 'Guernsey Pound',
  GHS: 'Ghanaian Cedi',
  GIP: 'Gibraltar Pound',
  GMD: 'Gambian Dalasi',
  GNF: 'Guinean Franc',
  GTQ: 'Guatemalan Quetzal',
  GYD: 'Guyanese Dollar',
  HKD: 'Hong Kong Dollar',
  HNL: 'Honduran Lempira',
  HRK: 'Croatian Kuna',
  HTG: 'Haitian Gourde',
  HUF: 'Hungarian Forint',
  IDR: 'Indonesian Rupiah',
  ILS: 'Israeli New Shekel',
  IMP: 'Isle of Man Pound',
  INR: 'Indian Rupee',
  IQD: 'Iraqi Dinar',
  IRR: 'Iranian Rial',
  ISK: 'Icelandic Króna',
  JEP: 'Jersey Pound',
  JMD: 'Jamaican Dollar',
  JOD: 'Jordanian Dinar',
  JPY: 'Japanese Yen',
  KES: 'Kenyan Shilling',
  KGS: 'Kyrgyzstani Som',
  KHR: 'Cambodian Riel',
  KMF: 'Comorian Franc',
  KRW: 'South Korean Won',
  KWD: 'Kuwaiti Dinar',
  KYD: 'Cayman Islands Dollar',
  KZT: 'Kazakhstani Tenge',
  LAK: 'Lao Kip',
  LBP: 'Lebanese Pound',
  LKR: 'Sri Lankan Rupee',
  LRD: 'Liberian Dollar',
  LSL: 'Lesotho Loti',
  LYD: 'Libyan Dinar',
  MAD: 'Moroccan Dirham',
  MDL: 'Moldovan Leu',
  MGA: 'Malagasy Ariary',
  MKD: 'Macedonian Denar',
  MMK: 'Myanmar Kyat',
  MNT: 'Mongolian Tögrög',
  MOP: 'Macanese Pataca',
  MRU: 'Mauritanian Ouguiya',
  MUR: 'Mauritian Rupee',
  MVR: 'Maldivian Rufiyaa',
  MWK: 'Malawian Kwacha',
  MXN: 'Mexican Peso',
  MYR: 'Malaysian Ringgit',
  MZN: 'Mozambican Metical',
  NAD: 'Namibian Dollar',
  NGN: 'Nigerian Naira',
  NIO: 'Nicaraguan Córdoba',
  NOK: 'Norwegian Krone',
  NPR: 'Nepalese Rupee',
  NZD: 'New Zealand Dollar',
  OMR: 'Omani Rial',
  PAB: 'Panamanian Balboa',
  PEN: 'Peruvian Sol',
  PGK: 'Papua New Guinean Kina',
  PHP: 'Philippine Peso',
  PKR: 'Pakistani Rupee',
  PLN: 'Polish Złoty',
  PYG: 'Paraguayan Guaraní',
  QAR: 'Qatari Riyal',
  RON: 'Romanian Leu',
  RSD: 'Serbian Dinar',
  RUB: 'Russian Ruble',
  RWF: 'Rwandan Franc',
  SAR: 'Saudi Riyal',
  SBD: 'Solomon Islands Dollar',
  SCR: 'Seychellois Rupee',
  SDG: 'Sudanese Pound',
  SEK: 'Swedish Krona',
  SGD: 'Singapore Dollar',
  SHP: 'Saint Helena Pound',
  SLE: 'Sierra Leonean Leone',
  SLL: 'Sierra Leonean Leone',
  SOS: 'Somali Shilling',
  SRD: 'Surinamese Dollar',
  SSP: 'South Sudanese Pound',
  STN: 'São Tomé and Príncipe Dobra',
  SYP: 'Syrian Pound',
  SZL: 'Eswatini Lilangeni',
  THB: 'Thai Baht',
  TJS: 'Tajikistani Somoni',
  TMT: 'Turkmenistani Manat',
  TND: 'Tunisian Dinar',
  TOP: 'Tongan Paʻanga',
  TRY: 'Turkish Lira',
  TTD: 'Trinidad and Tobago Dollar',
  TWD: 'New Taiwan Dollar',
  TZS: 'Tanzanian Shilling',
  UAH: 'Ukrainian Hryvnia',
  UGX: 'Ugandan Shilling',
  USD: 'United States Dollar',
  UYU: 'Uruguayan Peso',
  UZS: 'Uzbekistani Som',
  VES: 'Venezuelan Bolívar',
  VND: 'Vietnamese Đồng',
  VUV: 'Vanuatu Vatu',
  WST: 'Samoan Tālā',
  XAF: 'Central African CFA Franc',
  XCD: 'East Caribbean Dollar',
  XDR: 'Special Drawing Rights',
  XOF: 'West African CFA Franc',
  XPF: 'CFP Franc',
  YER: 'Yemeni Rial',
  ZAR: 'South African Rand',
  ZMW: 'Zambian Kwacha',
  ZWL: 'Zimbabwean Dollar'
};

function normalizeCode(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  if (SYMBOL_ALIASES[raw]) return SYMBOL_ALIASES[raw];

  const aliasKey = raw
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9₦₵$€£¥₹₩₽₺₱₫฿₪-]/g, '');

  if (CURRENCY_ALIASES[aliasKey]) return CURRENCY_ALIASES[aliasKey];

  const cleaned = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();
  if (/^[A-Z]{3}$/.test(cleaned)) return cleaned;

  return null;
}

function parseAmountToken(token) {
  const raw = String(token || '').trim();
  if (!raw) return null;

  const prefixSymbol = raw[0];
  const suffixSymbol = raw[raw.length - 1];

  let symbolCode = SYMBOL_ALIASES[prefixSymbol] || SYMBOL_ALIASES[suffixSymbol] || null;
  const cleaned = raw.replace(/[,$€£¥₦₵₹₩₽₺₱₫฿₪]/g, '').replace(/,/g, '');
  const amount = Number(cleaned);

  if (!Number.isFinite(amount) || amount <= 0) return null;

  return { amount, symbolCode };
}

function parseAmount(value) {
  const parsed = parseAmountToken(value);
  return parsed?.amount || null;
}

function currencyName(code) {
  if (!code) return 'Unknown currency';

  try {
    const name = new Intl.DisplayNames(['en'], { type: 'currency' }).of(code);
    if (name && name !== code) return name;
  } catch {}

  return STATIC_NAMES[code] || code;
}

function currencySymbol(code) {
  return SYMBOLS[code] || code;
}

function formatNumber(value, digits = 2) {
  const number = Number(value || 0);
  return number.toLocaleString('en-US', {
    maximumFractionDigits: digits,
    minimumFractionDigits: Math.abs(number) < 1 && number !== 0 ? Math.min(6, digits) : 0
  });
}

function formatMoney(value, code) {
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      maximumFractionDigits: Math.abs(value) < 1 ? 6 : 2
    }).format(value);
  } catch {
    return `${currencySymbol(code)}${formatNumber(value, Math.abs(value) < 1 ? 6 : 2)} ${code}`;
  }
}

function supportedRuntimeCodes() {
  try {
    if (typeof Intl.supportedValuesOf === 'function') {
      return Intl.supportedValuesOf('currency');
    }
  } catch {}

  return Object.keys(STATIC_NAMES);
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'user-agent': 'RumiBot/1.0'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFrankfurterRates(base, date = null) {
  const path = date ? `${date}` : 'latest';
  const url = `https://api.frankfurter.dev/v1/${path}?base=${encodeURIComponent(base)}`;
  const data = await fetchJson(url);

  if (!data?.rates || typeof data.rates !== 'object') {
    throw new Error('Frankfurter returned no rates.');
  }

  return {
    provider: 'Frankfurter',
    base: data.base || base,
    date: data.date || date || null,
    rates: {
      [base]: 1,
      ...data.rates
    }
  };
}

async function fetchOpenErRates(base) {
  const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(base)}`;
  const data = await fetchJson(url);

  if (data?.result && data.result !== 'success') {
    throw new Error(data['error-type'] || 'Open exchange endpoint returned an error.');
  }

  if (!data?.rates || typeof data.rates !== 'object') {
    throw new Error('Open exchange endpoint returned no rates.');
  }

  return {
    provider: 'ExchangeRate open endpoint',
    base: data.base_code || base,
    date: data.time_last_update_utc || null,
    rates: {
      [base]: 1,
      ...data.rates
    }
  };
}

async function getRates(base, date = null) {
  const code = normalizeCode(base);
  if (!code) throw new Error('Invalid base currency.');

  const key = `${date || 'latest'}:${code}`;
  const cached = RATE_CACHE.get(key);

  if (cached && Date.now() - cached.at < CACHE_TTL) {
    return cached.value;
  }

  let value = null;

  if (date) {
    value = await fetchFrankfurterRates(code, date);
  } else {
    try {
      value = await fetchFrankfurterRates(code);
    } catch {
      value = await fetchOpenErRates(code);
    }
  }

  RATE_CACHE.set(key, {
    at: Date.now(),
    value
  });

  return value;
}

async function getCurrencyList() {
  if (currencyListCache && Date.now() - currencyListCacheAt < CACHE_TTL) {
    return currencyListCache;
  }

  const map = {};

  for (const code of supportedRuntimeCodes()) {
    map[code] = currencyName(code);
  }

  for (const [code, name] of Object.entries(STATIC_NAMES)) {
    map[code] = name;
  }

  try {
    const frankfurter = await fetchJson('https://api.frankfurter.dev/v1/currencies');
    if (frankfurter && typeof frankfurter === 'object') {
      for (const [code, name] of Object.entries(frankfurter)) {
        map[String(code).toUpperCase()] = String(name);
      }
    }
  } catch {}

  try {
    const openRates = await fetchOpenErRates('USD');
    for (const code of Object.keys(openRates.rates || {})) {
      map[String(code).toUpperCase()] =
        map[String(code).toUpperCase()] || currencyName(String(code).toUpperCase());
    }
  } catch {}

  const list = Object.entries(map)
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  currencyListCache = list;
  currencyListCacheAt = Date.now();

  return list;
}

function parseConvertArgs(args) {
  const parts = [...args];
  const amountToken = parseAmountToken(parts.shift());
  if (!amountToken) return null;

  let from = amountToken.symbolCode || normalizeCode(parts.shift());

  if (['to', 'in', 'as', 'into'].includes(String(parts[0] || '').toLowerCase())) {
    parts.shift();
  }

  const to = normalizeCode(parts.shift());

  if (!from || !to) return null;

  return {
    amount: amountToken.amount,
    from,
    to
  };
}

function parseCompareArgs(args) {
  const parts = [...args];
  const amountToken = parseAmountToken(parts.shift());
  if (!amountToken) return null;

  const from = amountToken.symbolCode || normalizeCode(parts.shift());
  if (!from) return null;

  const targets = parts
    .filter((x) => !['to', 'in', 'as', 'into', 'and', ','].includes(String(x).toLowerCase()))
    .map(normalizeCode)
    .filter(Boolean);

  if (!targets.length) return null;

  return {
    amount: amountToken.amount,
    from,
    targets: [...new Set(targets)].slice(0, 12)
  };
}

function parsePage(args, fallback = 1) {
  const last = String(args.at(-1) || '');

  if (/^\d+$/.test(last)) {
    args.pop();
    return Math.max(1, Number(last));
  }

  return fallback;
}

function paginate(items, page, perPage = 20) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;

  return {
    page: safePage,
    totalPages,
    items: items.slice(start, start + perPage)
  };
}

function isDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function usage(prefix = ',') {
  return [
    `Use \`${prefix}currency <amount> <from> to <to>\`.`,
    '',
    '**Convert**',
    `\`${prefix}currency 100 USD to NGN\``,
    `\`${prefix}currency convert 20 cedis to naira\``,
    `\`${prefix}currency £50 to KES\``,
    '',
    '**Other subcommands**',
    `\`${prefix}currency rates USD\``,
    `\`${prefix}currency list\``,
    `\`${prefix}currency search naira\``,
    `\`${prefix}currency info NGN\``,
    `\`${prefix}currency popular USD\``,
    `\`${prefix}currency compare 100 USD NGN GHS KES GBP\``,
    `\`${prefix}currency inverse 100 USD to NGN\``,
    `\`${prefix}currency history 2024-01-01 100 USD to GBP\``,
    `\`${prefix}currency symbols\``
  ].join('\n');
}

async function convert(parsed, date = null) {
  const data = await getRates(parsed.from, date);
  const rate = Number(data.rates[parsed.to]);

  if (!Number.isFinite(rate)) {
    throw new Error(`No rate found for ${parsed.from} → ${parsed.to}.`);
  }

  return {
    ...data,
    rate,
    result: parsed.amount * rate
  };
}

module.exports = {
  name: 'currency',
  aliases: ['convertcurrency', 'fx', 'forex', 'moneyconvert', 'convertmoney', 'rate'],
  category: 'utility',
  description: 'Convert currencies, view rates, compare currencies, and search currency codes.',
  usage: 'currency <convert|rates|list|search|info|popular|compare|inverse|history|symbols|help> ...',
  examples: [
    'currency 100 USD to NGN',
    'currency convert 20 cedis to naira',
    'currency rates USD',
    'currency list',
    'currency search naira',
    'currency info GBP',
    'currency popular USD',
    'currency compare 100 USD NGN GHS KES',
    'currency inverse 100 USD to NGN',
    'currency history 2024-01-01 100 USD to GBP',
    'currency symbols'
  ],
  slash: true,
  botPermissions: [PermissionFlagsBits.EmbedLinks],
  subcommands: [
    {
      name: 'convert',
      aliases: ['c'],
      description: 'Convert one currency to another.',
      usage: 'currency convert <amount> <from> to <to>',
      examples: ['currency convert 100 USD to NGN', 'currency convert 20 cedis to naira']
    },
    {
      name: 'rates',
      aliases: ['rate'],
      description: 'Show exchange rates for a base currency.',
      usage: 'currency rates <base> [page]',
      examples: ['currency rates USD', 'currency rates GBP 2']
    },
    {
      name: 'list',
      aliases: ['codes', 'currencies'],
      description: 'Show supported currency codes.',
      usage: 'currency list [page]',
      examples: ['currency list', 'currency list 3']
    },
    {
      name: 'search',
      aliases: ['find'],
      description: 'Search currencies by code, alias, or name.',
      usage: 'currency search <query>',
      examples: ['currency search naira', 'currency search dollar']
    },
    {
      name: 'info',
      aliases: ['about'],
      description: 'Show information about a currency.',
      usage: 'currency info <code|name>',
      examples: ['currency info NGN', 'currency info pounds']
    },
    {
      name: 'popular',
      aliases: ['top'],
      description: 'Show popular conversions from a base currency.',
      usage: 'currency popular [base]',
      examples: ['currency popular USD', 'currency popular GBP']
    },
    {
      name: 'compare',
      aliases: ['multi'],
      description: 'Convert one amount into multiple currencies.',
      usage: 'currency compare <amount> <from> <to1> <to2> ...',
      examples: ['currency compare 100 USD NGN GHS KES GBP']
    },
    {
      name: 'inverse',
      aliases: ['reverse'],
      description: 'Show direct and reverse exchange rates.',
      usage: 'currency inverse <amount> <from> to <to>',
      examples: ['currency inverse 100 USD to NGN']
    },
    {
      name: 'history',
      aliases: ['historical', 'date'],
      description: 'Convert using a historical date.',
      usage: 'currency history <YYYY-MM-DD> <amount> <from> to <to>',
      examples: ['currency history 2024-01-01 100 USD to GBP']
    },
    {
      name: 'symbols',
      aliases: ['aliases'],
      description: 'Show common currency symbols and aliases.',
      usage: 'currency symbols',
      examples: ['currency symbols']
    },
    {
      name: 'help',
      description: 'Show currency command help.',
      usage: 'currency help',
      examples: ['currency help']
    }
  ],

  async execute({ message, args, prefix }) {
    const commandPrefix = prefix || message.prefix || ',';
    const first = String(args[0] || '').toLowerCase();

    if (!args.length || first === 'help') {
      return respond.reply(message, 'info', usage(commandPrefix), { mentionUser: false });
    }

    if (first === 'convert' || first === 'c') {
      args.shift();
    }

    if (['rates', 'rate'].includes(first)) {
      args.shift();

      const base = normalizeCode(args.shift() || 'USD');
      const page = parsePage(args);

      if (!base) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}currency rates <base>\`.`, {
          mentionUser: false
        });
      }

      const data = await getRates(base).catch((error) => ({ error }));

      if (data.error) {
        return respond.reply(message, 'bad', `I could not fetch rates: ${data.error.message}`, {
          mentionUser: false
        });
      }

      const rows = Object.entries(data.rates)
        .filter(([code]) => code !== base)
        .map(([code, rate]) => ({
          code,
          name: currencyName(code),
          rate: Number(rate)
        }))
        .sort((a, b) => a.code.localeCompare(b.code));

      const pageData = paginate(rows, page, 15);

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Exchange rates for ${base}`,
        allowTitle: true,
        description: pageData.items
          .map((row) => `**${row.code}** — ${row.name}\n\`1 ${base} = ${formatNumber(row.rate, 6)} ${row.code}\``)
          .join('\n\n'),
        fields: [
          { name: 'Provider', value: data.provider, inline: true },
          { name: 'Updated', value: data.date ? String(data.date) : 'Latest available', inline: true },
          { name: 'Page', value: `${pageData.page}/${pageData.totalPages}`, inline: true }
        ]
      });
    }

    if (['list', 'codes', 'currencies'].includes(first)) {
      args.shift();

      const page = parsePage(args);
      const list = await getCurrencyList();
      const pageData = paginate(list, page, 25);

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Supported currencies',
        allowTitle: true,
        description: pageData.items.map((row) => `**${row.code}** — ${row.name}`).join('\n'),
        fields: [
          { name: 'Total loaded', value: String(list.length), inline: true },
          { name: 'Page', value: `${pageData.page}/${pageData.totalPages}`, inline: true }
        ]
      });
    }

    if (['search', 'find'].includes(first)) {
      args.shift();

      const query = args.join(' ').trim().toLowerCase();
      if (!query) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}currency search <query>\`.`, {
          mentionUser: false
        });
      }

      const list = await getCurrencyList();
      const aliasHit = CURRENCY_ALIASES[query.replace(/\s+/g, '-')];

      const matches = list
        .filter((row) =>
          row.code.toLowerCase().includes(query) ||
          row.name.toLowerCase().includes(query) ||
          aliasHit === row.code
        )
        .slice(0, 25);

      return respond.reply(message, matches.length ? 'info' : 'bad', null, {
        mentionUser: false,
        title: `Currency search: ${query}`,
        allowTitle: true,
        description: matches.length
          ? matches.map((row) => `**${row.code}** — ${row.name}`).join('\n')
          : 'No currencies matched that query.'
      });
    }

    if (['info', 'about'].includes(first)) {
      args.shift();

      const code = normalizeCode(args.join(' ') || args[0]);
      if (!code) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}currency info <code|name>\`.`, {
          mentionUser: false
        });
      }

      const data = await getRates(code).catch(() => null);
      const available = Boolean(data?.rates);

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Currency info: ${code}`,
        allowTitle: true,
        description: [
          `**Code:** \`${code}\``,
          `**Name:** ${currencyName(code)}`,
          `**Symbol:** ${currencySymbol(code)}`,
          `**Live rates:** ${available ? 'available' : 'not available from current provider'}`
        ].join('\n')
      });
    }

    if (['popular', 'top'].includes(first)) {
      args.shift();

      const base = normalizeCode(args.shift() || 'USD') || 'USD';
      const data = await getRates(base).catch((error) => ({ error }));

      if (data.error) {
        return respond.reply(message, 'bad', `I could not fetch popular rates: ${data.error.message}`, {
          mentionUser: false
        });
      }

      const lines = POPULAR_CODES
        .filter((code) => code !== base && Number.isFinite(Number(data.rates[code])))
        .map((code) => `**${code}** — ${currencyName(code)}\n\`1 ${base} = ${formatNumber(Number(data.rates[code]), 6)} ${code}\``)
        .slice(0, 12);

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Popular rates from ${base}`,
        allowTitle: true,
        description: lines.join('\n\n') || 'No popular rates available for that base currency.',
        fields: [
          { name: 'Provider', value: data.provider, inline: true },
          { name: 'Updated', value: data.date ? String(data.date) : 'Latest available', inline: true }
        ]
      });
    }

    if (['compare', 'multi'].includes(first)) {
      args.shift();

      const parsed = parseCompareArgs(args);
      if (!parsed) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}currency compare <amount> <from> <to1> <to2> ...\`.`, {
          mentionUser: false
        });
      }

      const data = await getRates(parsed.from).catch((error) => ({ error }));

      if (data.error) {
        return respond.reply(message, 'bad', `I could not compare rates: ${data.error.message}`, {
          mentionUser: false
        });
      }

      const lines = parsed.targets.map((code) => {
        const rate = Number(data.rates[code]);
        if (!Number.isFinite(rate)) return `**${code}** — no rate available`;
        return `**${code}** — ${formatMoney(parsed.amount * rate, code)}\n\`${formatNumber(rate, 6)} per 1 ${parsed.from}\``;
      });

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Currency comparison`,
        allowTitle: true,
        description: [
          `Base: **${formatMoney(parsed.amount, parsed.from)}**`,
          '',
          lines.join('\n\n')
        ].join('\n'),
        fields: [
          { name: 'Provider', value: data.provider, inline: true },
          { name: 'Updated', value: data.date ? String(data.date) : 'Latest available', inline: true }
        ]
      });
    }

    if (['inverse', 'reverse'].includes(first)) {
      args.shift();

      const parsed = parseConvertArgs(args);
      if (!parsed) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}currency inverse <amount> <from> to <to>\`.`, {
          mentionUser: false
        });
      }

      const data = await convert(parsed).catch((error) => ({ error }));

      if (data.error) {
        return respond.reply(message, 'bad', `I could not calculate inverse rate: ${data.error.message}`, {
          mentionUser: false
        });
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Inverse exchange rate',
        allowTitle: true,
        description: [
          `### ${formatMoney(parsed.amount, parsed.from)} = ${formatMoney(data.result, parsed.to)}`,
          '',
          `\`1 ${parsed.from} = ${formatNumber(data.rate, 6)} ${parsed.to}\``,
          `\`1 ${parsed.to} = ${formatNumber(1 / data.rate, 6)} ${parsed.from}\``
        ].join('\n'),
        fields: [
          { name: 'Provider', value: data.provider, inline: true },
          { name: 'Updated', value: data.date ? String(data.date) : 'Latest available', inline: true }
        ]
      });
    }

    if (['history', 'historical', 'date'].includes(first)) {
      args.shift();

      const date = args.shift();

      if (!isDate(date)) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}currency history <YYYY-MM-DD> <amount> <from> to <to>\`.`, {
          mentionUser: false
        });
      }

      const parsed = parseConvertArgs(args);
      if (!parsed) {
        return respond.reply(message, 'info', `Use \`${commandPrefix}currency history ${date} <amount> <from> to <to>\`.`, {
          mentionUser: false
        });
      }

      const data = await convert(parsed, date).catch((error) => ({ error }));

      if (data.error) {
        return respond.reply(message, 'bad', `I could not fetch historical rates: ${data.error.message}`, {
          mentionUser: false
        });
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: `Historical conversion • ${data.date || date}`,
        allowTitle: true,
        description: [
          `### ${formatMoney(parsed.amount, parsed.from)} = ${formatMoney(data.result, parsed.to)}`,
          '',
          `\`1 ${parsed.from} = ${formatNumber(data.rate, 6)} ${parsed.to}\``
        ].join('\n'),
        fields: [
          { name: 'Provider', value: data.provider, inline: true },
          { name: 'Date', value: String(data.date || date), inline: true }
        ]
      });
    }

    if (['symbols', 'aliases'].includes(first)) {
      const symbolLines = Object.entries(SYMBOLS)
        .map(([code, symbol]) => `**${code}** — \`${symbol}\` — ${currencyName(code)}`)
        .slice(0, 25);

      const aliasLines = Object.entries(CURRENCY_ALIASES)
        .slice(0, 25)
        .map(([alias, code]) => `\`${alias}\` → **${code}**`);

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Currency symbols & aliases',
        allowTitle: true,
        description: [
          '**Common symbols**',
          symbolLines.join('\n'),
          '',
          '**Common aliases**',
          aliasLines.join('\n')
        ].join('\n')
      });
    }

    const parsed = parseConvertArgs(args);

    if (!parsed) {
      return respond.reply(message, 'info', usage(commandPrefix), {
        mentionUser: false
      });
    }

    const data = await convert(parsed).catch((error) => ({ error }));

    if (data.error) {
      return respond.reply(message, 'bad', `I could not convert that: ${data.error.message}`, {
        mentionUser: false
      });
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      title: 'Currency conversion',
      allowTitle: true,
      description: [
        `### ${formatMoney(parsed.amount, parsed.from)} = ${formatMoney(data.result, parsed.to)}`,
        '',
        `\`1 ${parsed.from} = ${formatNumber(data.rate, 6)} ${parsed.to}\``,
        `\`1 ${parsed.to} = ${formatNumber(1 / data.rate, 6)} ${parsed.from}\``
      ].join('\n'),
      fields: [
        { name: 'From', value: `**${parsed.from}**\n${currencyName(parsed.from)}`, inline: true },
        { name: 'To', value: `**${parsed.to}**\n${currencyName(parsed.to)}`, inline: true },
        { name: 'Provider', value: data.provider, inline: true }
      ],
      footer: {
        text: data.date ? `Rates updated: ${data.date}` : 'Rates use the latest available provider data'
      }
    });
  }
};