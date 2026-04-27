const respond = require('../../utils/respond');
const {
  getAccount,
  saveAccount,
  purchaseRumiShopItem,
  activeVape,
  getRumiShopItem,
  refillVape,
  formatCoins
} = require('../../systems/economy/store');
const { getEconomySettings } = require('../../systems/economy/settings');

module.exports = {
  name: 'vape',
  aliases: ['juul', 'hitvape'],
  category: 'fun',
  description: 'Buy and use a vape. Vapes run out and need replacing.',
  usage: 'vape <buy|status|hit|refill>',
  examples: ['vape buy', 'vape buy juice', 'vape', 'vape status', 'vape refill'],
  subcommands: [
    {
      name: 'buy',
      aliases: ['purchase'],
      description: 'Buy a vape or vape juice from the Rumi shop.',
      usage: 'vape buy [juice]',
      examples: ['vape buy', 'vape buy juice']
    },
    {
      name: 'status',
      aliases: ['view'],
      description: 'Show your current vape status.',
      usage: 'vape status',
      examples: ['vape status']
    },
    {
      name: 'hit',
      aliases: ['use'],
      description: 'Take a hit from your current vape.',
      usage: 'vape hit',
      examples: ['vape', 'vape hit']
    },
    {
      name: 'refill',
      aliases: ['juice'],
      description: 'Refill an empty vape using vape juice from the Rumi shop.',
      usage: 'vape refill',
      examples: ['vape refill']
    }
  ],
  guildOnly: true,
  cooldown: 5,

  async execute({ message, args }) {
    const sub = (args.shift() || 'hit').toLowerCase();
    const targetBuy = String(args[0] || '').toLowerCase();
    const itemKey = ['juice', 'vapejuice', 'refill'].includes(targetBuy) ? 'vapejuice' : 'vape';
    const vapeItem = getRumiShopItem(itemKey);
    const vapePrice = vapeItem?.price || 250;
    const settings = await getEconomySettings(message.guild.id);

    if (sub === 'buy') {
      const purchase = await purchaseRumiShopItem(message.guild.id, message.author.id, itemKey);
      if (!purchase.ok) {
        return respond.reply(message, 'bad', `You need **${settings.currencyIcon} ${formatCoins(vapePrice)}** ${settings.currencyName} to buy ${itemKey === 'vapejuice' ? 'vape juice' : 'a vape'}.`);
      }

      if (itemKey === 'vapejuice') {
        return respond.reply(message, 'good', `You bought vape juice for **${settings.currencyIcon} ${formatCoins(vapePrice)}** ${settings.currencyName}. Use \`${message.prefix || ','}vape refill\` when your vape is empty.`);
      }

      return respond.reply(message, 'good', `You bought a vape for **${settings.currencyIcon} ${formatCoins(vapePrice)}** ${settings.currencyName}. Juice: **${purchase.item.juice}**, durability: **${purchase.item.durability}**.`);
    }

    if (sub === 'status') {
      const account = await getAccount(message.guild.id, message.author.id);
      const vape = activeVape(account) || [...(account.inventory || [])]
        .filter((item) => item.kind === 'rumi' && item.type === 'vape')
        .sort((a, b) => new Date(b.purchasedAt || 0).getTime() - new Date(a.purchasedAt || 0).getTime())[0];

      if (!vape) {
        return respond.reply(message, 'info', `You do not have an active vape. Buy one with \`${message.prefix || ','}vape buy\`.`);
      }

      return respond.reply(message, 'info', null, {
        mentionUser: false,
        description: `**Vape status**\nHits: \`${vape.hits || 0}\`\nJuice: \`${vape.juice}\`\nDurability: \`${vape.durability}\`\nStatus: \`${vape.status}\``
      });
    }

    if (sub === 'refill' || sub === 'juice') {
      const result = await refillVape(message.guild.id, message.author.id);
      if (!result.ok) {
        if (result.reason === 'missing-vape') {
          return respond.reply(message, 'bad', `You do not have a refillable vape. Buy one with \`${message.prefix || ','}vape buy\`.`);
        }
        if (result.reason === 'missing-juice') {
          const juiceItem = getRumiShopItem('vapejuice');
          return respond.reply(message, 'bad', `You need vape juice first. Buy it from \`${message.prefix || ','}rumishop\` or \`${message.prefix || ','}vape buy juice\` for **${settings.currencyIcon} ${formatCoins(juiceItem?.price || 75)}** ${settings.currencyName}.`);
        }
        if (result.reason === 'already-filled') {
          return respond.reply(message, 'info', 'That vape still has juice left.');
        }
      }

      return respond.reply(message, 'good', `You refilled your vape. Juice: **${result.vape.juice}** | Durability: **${result.vape.durability}**.`);
    }

    const account = await getAccount(message.guild.id, message.author.id);
    const vape = activeVape(account);

    if (!vape) {
      return respond.reply(message, 'bad', `You need a vape first. Buy one with \`${message.prefix || ','}vape buy\` or check \`${message.prefix || ','}rumishop\` for **${settings.currencyIcon} ${formatCoins(vapePrice)}** ${settings.currencyName}.`);
    }

    vape.hits = Math.max(0, Number(vape.hits || 0) + 1);
    vape.juice = Math.max(0, Number(vape.juice || 0) - 1);
    vape.durability = Math.max(0, Number(vape.durability || 0) - 1);

    let result = 'hit';
    if (vape.durability <= 0) {
      vape.status = 'dead';
      result = 'dead';
    } else if (vape.juice <= 0) {
      vape.status = 'empty';
      result = 'empty';
    }

    await saveAccount(message.guild.id, message.author.id, account);

    if (result === 'dead') {
      return respond.reply(message, 'alert', `You take one last hit... and your vape dies. Time to buy another one.`);
    }

    if (result === 'empty') {
      return respond.reply(message, 'alert', `You take one last hit... and your vape is empty. Buy another one or refill when that exists.`);
    }

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `${message.author} takes a hit from the vape.\nHits: **${vape.hits}** | Juice left: **${vape.juice}** | Durability left: **${vape.durability}**.`
    });
  }
};
