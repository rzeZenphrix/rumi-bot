const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { getAccount, parseAmount, transferCash, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');

module.exports = {
  name: 'give',
  aliases: ['pay'],
  category: 'economy',
  description: 'Transfer currency to another user.',
  usage: 'give <user> <amount>',
  examples: ['give @user 50'],
  guildOnly: true,

  async execute({ client, message, args }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'give'))) {
      return respond.reply(message, 'bad', 'The give command is disabled in this server economy.');
    }

    const user = await resolveUser(client, args.shift());
    const from = await getAccount(message.guild.id, message.author.id);
    const amount = parseAmount(args.shift(), from.cash);
    const settings = await getEconomySettings(message.guild.id);
    if (!user || !Number.isFinite(amount) || amount <= 0) {
      return respond.reply(message, 'info', 'Use `give <user> <amount>`.');
    }
    if (user.id === message.author.id) {
      return respond.reply(message, 'bad', 'You cannot pay yourself.');
    }

    const transfer = await transferCash(message.guild.id, message.author.id, user.id, amount, { taxRate: settings.taxRate });
    if (!transfer.ok) {
      return respond.reply(message, 'bad', 'You do not have enough cash.');
    }

    return respond.reply(message, 'good', `Sent **${settings.currencyIcon} ${formatCoins(transfer.amount)}** ${settings.currencyName} to ${user}.${transfer.taxAmount ? ` Tax: **${settings.currencyIcon} ${formatCoins(transfer.taxAmount)}**.` : ''}`);
  }
};
