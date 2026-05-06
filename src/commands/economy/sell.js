const respond = require('../../utils/respond');
const { sellGuildShopItem, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');

module.exports = {
  name: 'sell',
  aliases: [],
  category: 'economy',
  description: 'Sell an owned item back to the shop.',
  usage: 'sell <item>',
  examples: ['sell vape', 'sell stickerpack'],
  guildOnly: true,

  async execute({ message, args }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'sell'))) {
      return respond.reply(message, 'bad', 'The sell command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    const itemKey = args.join(' ');
    if (!itemKey) return respond.reply(message, 'info', 'Use `sell <item>`.');

    const result = await sellGuildShopItem(message.guild.id, message.author.id, itemKey);
    if (!result.ok) {
      return respond.reply(message, 'bad', 'You do not own that sellable server-shop item.');
    }

    return respond.reply(message, 'good', `Sold **${result.item.displayName}** for **${settings.currencyIcon} ${formatCoins(result.amount)}**. Cash: **${settings.currencyIcon} ${formatCoins(result.account.cash)}**.`);
  }
};
