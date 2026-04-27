const respond = require('../../utils/respond');
const { getAccount, withdrawCash, parseAmount, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');

module.exports = {
  name: 'withdraw',
  aliases: ['with', 'wd'],
  category: 'economy',
  description: 'Move bank coins back into cash.',
  usage: 'withdraw <amount|all>',
  examples: ['withdraw 250', 'withdraw all'],
  guildOnly: true,

  async execute({ message, args }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'withdraw'))) {
      return respond.reply(message, 'bad', 'The withdraw command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    const account = await getAccount(message.guild.id, message.author.id);
    const amount = parseAmount(args[0], account.bank);

    if (!Number.isFinite(amount) || amount <= 0) {
      return respond.reply(message, 'info', 'Use `withdraw <amount|all>`.');
    }

    const result = await withdrawCash(message.guild.id, message.author.id, amount);
    if (!result.ok) {
      return respond.reply(message, 'bad', 'You do not have enough banked coins for that withdrawal.');
    }

    return respond.reply(message, 'good', `Withdrew **${settings.currencyIcon} ${formatCoins(result.amount)}** ${settings.currencyName}. Cash: **${settings.currencyIcon} ${formatCoins(result.account.cash)}**.`);
  }
};
