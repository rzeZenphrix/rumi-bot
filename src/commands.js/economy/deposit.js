const respond = require('../../utils/respond');
const { getAccount, depositCash, parseAmount, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');

module.exports = {
  name: 'deposit',
  aliases: ['dep'],
  category: 'economy',
  description: 'Move cash into your bank balance.',
  usage: 'deposit <amount|all>',
  examples: ['deposit 500', 'deposit all'],
  guildOnly: true,

  async execute({ message, args }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'deposit'))) {
      return respond.reply(message, 'bad', 'The deposit command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    const account = await getAccount(message.guild.id, message.author.id);
    const amount = parseAmount(args[0], account.cash);

    if (!Number.isFinite(amount) || amount <= 0) {
      return respond.reply(message, 'info', 'Use `deposit <amount|all>`.');
    }

    const result = await depositCash(message.guild.id, message.author.id, amount);
    if (!result.ok) {
      return respond.reply(message, 'bad', 'You do not have enough cash for that deposit.');
    }

    return respond.reply(message, 'good', `Deposited **${settings.currencyIcon} ${formatCoins(result.amount)}** ${settings.currencyName}. Bank: **${settings.currencyIcon} ${formatCoins(result.account.bank)}**.`);
  }
};
