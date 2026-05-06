const respond = require('../../utils/respond');
const { getRumiShopItems, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings } = require('../../systems/economy/settings');

module.exports = {
  name: 'rumishop',
  aliases: ['botshop'],
  category: 'economy',
  description: 'Browse the global Rumi item shop.',
  usage: 'rumishop',
  examples: ['rumishop'],
  guildOnly: true,

  async execute({ message }) {
    const settings = await getEconomySettings(message.guild.id);
    const items = getRumiShopItems();
    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: items
        .map((item) => {
          const preview = item.create?.() || {};
          const stats = [];
          if (Number.isFinite(preview.juice)) stats.push(`Juice: \`${preview.juice}\``);
          if (Number.isFinite(preview.durability)) stats.push(`Durability: \`${preview.durability}\``);
          if (Number.isFinite(preview.sticks)) stats.push(`Sticks: \`${preview.sticks}\``);
          if (Number.isFinite(preview.charges)) stats.push(`Charges: \`${preview.charges}\``);
          return `**${item.name}**\nPrice: ${settings.currencyIcon} ${formatCoins(item.price)}${stats.length ? `\n${stats.join(' | ')}` : ''}\n${item.description}`;
        })
        .join('\n\n')
    });
  }
};
