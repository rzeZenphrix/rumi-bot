const respond = require('../../utils/respond');
const { purchaseGuildShopItem, formatCoins, getGuildShopItem } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');

module.exports = {
  name: 'buy',
  aliases: ['purchase'],
  category: 'economy',
  description: 'Buy an item from the shop.',
  usage: 'buy <item>',
  examples: ['buy coffee'],
  guildOnly: true,

  async execute({ message, args }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'buy'))) {
      return respond.reply(message, 'bad', 'The buy command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    const itemKey = args.join(' ');
    if (!itemKey) return respond.reply(message, 'info', 'Use `buy <item>`.');

    const existing = await getGuildShopItem(message.guild.id, itemKey);
    if (existing?.roleIds?.length) {
      const allowed = existing.roleIds.some((roleId) => message.member.roles.cache.has(roleId));
      if (!allowed) {
        return respond.reply(message, 'bad', 'You do not have the required role to buy that item.');
      }
    }

    const result = await purchaseGuildShopItem(message.guild.id, message.author.id, itemKey);
    if (!result.ok) {
      if (result.reason === 'funds') {
        return respond.reply(message, 'bad', `You need **${settings.currencyIcon} ${formatCoins(result.item.price)}** ${settings.currencyName} to buy **${result.item.name}**.`);
      }
      return respond.reply(message, 'bad', `I could not find that server shop item. Try \`${message.prefix || ','}shop\` or \`${message.prefix || ','}rumishop\`.`);
    }

    return respond.reply(message, 'good', `Bought **${result.definition.name}** for **${settings.currencyIcon} ${formatCoins(result.definition.price)}**. Cash left: **${settings.currencyIcon} ${formatCoins(result.account.cash)}**.`);
  }
};
