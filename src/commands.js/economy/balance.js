const respond = require('../../utils/respond');
const { resolveUser } = require('../../utils/resolveUser');
const { getAccount, formatCoins, totalWealth, listTransactions } = require('../../systems/economy/store');
const { getEconomySettings } = require('../../systems/economy/settings');

module.exports = {
  name: 'balance',
  aliases: ['bal', 'money'],
  category: 'economy',
  description: 'Check your economy balance.',
  usage: 'balance [user]',
  examples: ['balance'],
  guildOnly: true,

  async execute({ client, message, args }) {
    const user = args[0] ? await resolveUser(client, args[0]) : message.author;
    if (!user) return respond.reply(message, 'bad', 'I could not find that user.');

    const settings = await getEconomySettings(message.guild.id);
    const account = await getAccount(message.guild.id, user.id);
    const transactions = await listTransactions(message.guild.id, user.id, 3);

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: `${user}`,
      fields: [
        { name: 'Cash', value: `${settings.currencyIcon} ${formatCoins(account.cash)}`, inline: true },
        { name: 'Bank', value: `${settings.currencyIcon} ${formatCoins(account.bank)}`, inline: true },
        { name: 'Net Worth', value: `${settings.currencyIcon} ${formatCoins(totalWealth(account))}`, inline: true },
        { name: 'Items', value: `\`${account.inventory?.filter((item) => item.status !== 'sold').length || 0}\``, inline: true },
        { name: 'Earned', value: `${settings.currencyIcon} ${formatCoins(account.totalEarned)}`, inline: true },
        { name: 'Spent', value: `${settings.currencyIcon} ${formatCoins(account.totalSpent)}`, inline: true },
        {
          name: 'Recent Activity',
          value: transactions.length
            ? transactions
                .map((entry) => `- ${entry.type} ${settings.currencyIcon} ${formatCoins(entry.amount)}`)
                .join('\n')
            : 'No recent activity yet.',
          inline: false
        }
      ]
    });
  }
};
