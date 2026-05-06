const respond = require('../../utils/respond');
const {
  getAccount,
  saveAccount,
  purchaseRumiShopItem,
  getRumiShopItem,
  formatCoins
} = require('../../systems/economy/store');
const { getEconomySettings } = require('../../systems/economy/settings');

function activePack(account = {}) {
  return (account.inventory || []).find((item) =>
    item.kind === 'rumi' &&
    item.type === 'cigarette' &&
    item.status === 'active' &&
    Number(item.sticks || 0) > 0
  );
}

function usableLighter(account = {}) {
  return (account.inventory || []).find((item) =>
    item.kind === 'rumi' &&
    item.type === 'lighter' &&
    item.status === 'active' &&
    Number(item.charges || 0) > 0
  );
}

function latestPack(account = {}) {
  return [...(account.inventory || [])]
    .filter((item) => item.kind === 'rumi' && item.type === 'cigarette')
    .sort((a, b) => new Date(b.purchasedAt || 0).getTime() - new Date(a.purchasedAt || 0).getTime())[0];
}

function latestLighter(account = {}) {
  return [...(account.inventory || [])]
    .filter((item) => item.kind === 'rumi' && item.type === 'lighter' && item.status !== 'sold')
    .sort((a, b) => new Date(b.purchasedAt || 0).getTime() - new Date(a.purchasedAt || 0).getTime())[0];
}

function randomLine(lines) {
  return lines[Math.floor(Math.random() * lines.length)];
}

const SMOKE_LINES = [
  'lights a cigarette and lets the smoke drift into the night.',
  'takes a slow cigarette break.',
  'flicks the lighter and takes a drag.',
  'steps aside for a smoke break.',
  'lights up, and exhales.'
];

module.exports = {
  name: 'cigarette',
  aliases: ['cig'],
  category: 'fun',
  description: 'Buy and use cigarettes. Cigarettes require a lighter instead of vape juice.',
  usage: 'cigarette <buy|status|smoke> [lighter]',
  examples: [
    'cigarette buy',
    'cigarette buy lighter',
    'cigarette',
    'cigarette status',
    'cigarette smoke'
  ],
  subcommands: [
    {
      name: 'buy',
      aliases: ['purchase'],
      description: 'Buy a cigarette pack or a lighter from the Rumi shop.',
      usage: 'cigarette buy [lighter]',
      examples: ['cigarette buy', 'cigarette buy lighter']
    },
    {
      name: 'status',
      aliases: ['view'],
      description: 'Show your cigarette pack and lighter status.',
      usage: 'cigarette status',
      examples: ['cigarette status']
    },
    {
      name: 'smoke',
      aliases: ['hit', 'use', 'light'],
      description: 'Smoke one cigarette if you have a lighter.',
      usage: 'cigarette smoke',
      examples: ['cigarette', 'cigarette smoke']
    }
  ],
  guildOnly: true,
  cooldown: 5,

  async execute({ message, args }) {
    const sub = String(args.shift() || 'smoke').toLowerCase();
    const targetBuy = String(args[0] || '').toLowerCase();
    const itemKey = ['lighter', 'light', 'fire'].includes(targetBuy) ? 'lighter' : 'cigarette';
    const item = getRumiShopItem(itemKey);
    const settings = await getEconomySettings(message.guild.id);

    if (['buy', 'purchase'].includes(sub)) {
      const purchase = await purchaseRumiShopItem(message.guild.id, message.author.id, itemKey);
      const price = item?.price || (itemKey === 'lighter' ? 60 : 180);

      if (!purchase.ok) {
        return respond.reply(
          message,
          'bad',
          `You need **${settings.currencyIcon} ${formatCoins(price)}** ${settings.currencyName} to buy ${itemKey === 'lighter' ? 'a lighter' : 'a cigarette pack'}.`
        );
      }

      if (itemKey === 'lighter') {
        return respond.reply(
          message,
          'good',
          `You bought a lighter for **${settings.currencyIcon} ${formatCoins(price)}** ${settings.currencyName}. Charges: **${purchase.item.charges}**. Use \`${message.prefix || ','}cigarette smoke\` when you have a pack.`
        );
      }

      return respond.reply(
        message,
        'good',
        `You bought a cigarette pack for **${settings.currencyIcon} ${formatCoins(price)}** ${settings.currencyName}. Sticks: **${purchase.item.sticks}**. You still need a lighter: \`${message.prefix || ','}cigarette buy lighter\`.`
      );
    }

    if (['status', 'view'].includes(sub)) {
      const account = await getAccount(message.guild.id, message.author.id);
      const pack = activePack(account) || latestPack(account);
      const lighter = usableLighter(account) || latestLighter(account);

      if (!pack && !lighter) {
        return respond.reply(
          message,
          'info',
          `You have no cigarette pack or lighter. Start with \`${message.prefix || ','}cigarette buy\` and \`${message.prefix || ','}cigarette buy lighter\`.`
        );
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        title: 'Cigarette status',
        description: [
          pack
            ? `**Pack**\nSticks left: \`${pack.sticks || 0}\`\nSmoked: \`${pack.smoked || 0}\`\nStatus: \`${pack.status || 'unknown'}\``
            : '**Pack**\nNo pack found.',
          lighter
            ? `**Lighter**\nCharges left: \`${lighter.charges || 0}\`\nStatus: \`${lighter.status || 'unknown'}\``
            : '**Lighter**\nNo lighter found.'
        ].join('\n\n')
      });
    }

    if (!['smoke', 'hit', 'use', 'light'].includes(sub)) {
      return respond.reply(
        message,
        'info',
        `Use \`${message.prefix || ','}cigarette buy\`, \`${message.prefix || ','}cigarette buy lighter\`, \`${message.prefix || ','}cigarette status\`, or \`${message.prefix || ','}cigarette smoke\`.`
      );
    }

    const account = await getAccount(message.guild.id, message.author.id);
    const pack = activePack(account);

    if (!pack) {
      const packItem = getRumiShopItem('cigarette');

      return respond.reply(
        message,
        'bad',
        `You need a cigarette pack first. Buy one with \`${message.prefix || ','}cigarette buy\` for **${settings.currencyIcon} ${formatCoins(packItem?.price || 180)}** ${settings.currencyName}.`
      );
    }

    const lighter = usableLighter(account);

    if (!lighter) {
      const lighterItem = getRumiShopItem('lighter');

      return respond.reply(
        message,
        'bad',
        `You need a lighter before you can smoke. Buy one with \`${message.prefix || ','}cigarette buy lighter\` for **${settings.currencyIcon} ${formatCoins(lighterItem?.price || 60)}** ${settings.currencyName}.`
      );
    }

    pack.sticks = Math.max(0, Number(pack.sticks || 0) - 1);
    pack.smoked = Math.max(0, Number(pack.smoked || 0) + 1);
    pack.lastUsedAt = new Date().toISOString();

    lighter.charges = Math.max(0, Number(lighter.charges || 0) - 1);
    lighter.lastUsedAt = new Date().toISOString();

    if (pack.sticks <= 0) pack.status = 'empty';
    if (lighter.charges <= 0) lighter.status = 'empty';

    await saveAccount(message.guild.id, message.author.id, account);

    const extra = [];
    if (pack.status === 'empty') extra.push('That was the last cigarette in the pack.');
    if (lighter.status === 'empty') extra.push('Your lighter is now out of charges.');

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: [
        `${message.author} ${randomLine(SMOKE_LINES)}`,
        `Sticks left: **${pack.sticks}** | Lighter charges: **${lighter.charges}**`,
        extra.length ? `\n${extra.join(' ')}` : null
      ].filter(Boolean).join('\n')
    });
  }
};