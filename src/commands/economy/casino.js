const respond = require('../../utils/respond');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');
const { getAccount, parseAmount, updateAccount, formatCoins } = require('../../systems/economy/store');

const SIDES = ['heads', 'tails'];

function remaining(seconds, last) {
  const left = Math.ceil((Number(last || 0) + seconds * 1000 - Date.now()) / 1000);
  if (left <= 0) return null;
  return left >= 60 ? `${Math.ceil(left / 60)}m` : `${left}s`;
}

async function settleBet(guildId, userId, amount, won) {
  return updateAccount(guildId, userId, (account) => {
    account.cash = Number(account.cash || 0) + (won ? amount : -amount);
    if (won) account.totalEarned = Number(account.totalEarned || 0) + amount;
    else account.totalSpent = Number(account.totalSpent || 0) + amount;
    account.lastCasino = Date.now();
    return account;
  });
}

module.exports = {
  name: 'casino',
  aliases: ['gamble'],
  category: 'economy',
  description: 'Play simple server economy casino games.',
  usage: 'casino <coinflip|slots> <bet> [heads|tails]',
  examples: ['casino coinflip 100 heads', 'casino slots 50'],
  guildOnly: true,
  cooldown: 3,

  async execute({ message, args }) {
    if (!await isEconomyCommandEnabled(message.guild.id, 'casino')) {
      return respond.reply(message, 'bad', 'Casino games are disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    if (!settings.casinoEnabled) return respond.reply(message, 'info', 'Casino games are disabled in this server economy.');

    const game = String(args.shift() || 'coinflip').toLowerCase();
    const account = await getAccount(message.guild.id, message.author.id);
    const wait = remaining(settings.casinoCooldownSeconds, account.lastCasino);
    if (wait) return respond.reply(message, 'time', `You can gamble again in **${wait}**.`);

    const bet = parseAmount(args.shift(), account.cash);
    if (!Number.isFinite(bet) || bet < settings.casinoMinBet || bet > settings.casinoMaxBet) {
      return respond.reply(message, 'info', `Bet between **${formatCoins(settings.casinoMinBet)}** and **${formatCoins(settings.casinoMaxBet)}** ${settings.currencyIcon}.`);
    }
    if (Number(account.cash || 0) < bet) return respond.reply(message, 'bad', 'You do not have enough cash for that bet.');

    if (['coinflip', 'cf', 'coin'].includes(game)) {
      const pick = SIDES.includes(String(args[0] || '').toLowerCase()) ? String(args[0]).toLowerCase() : SIDES[Math.floor(Math.random() * SIDES.length)];
      const landed = SIDES[Math.floor(Math.random() * SIDES.length)];
      const won = pick === landed;
      await settleBet(message.guild.id, message.author.id, bet, won);
      return respond.reply(message, won ? 'good' : 'bad', `Coin landed **${landed}**. You ${won ? 'won' : 'lost'} **${formatCoins(bet)}** ${settings.currencyIcon}.`);
    }

    if (['slots', 'slot'].includes(game)) {
      const icons = ['7', 'star', 'moon', 'cherry'];
      const roll = Array.from({ length: 3 }, () => icons[Math.floor(Math.random() * icons.length)]);
      const won = roll.every((item) => item === roll[0]);
      const payout = won ? bet * 3 : bet;
      await settleBet(message.guild.id, message.author.id, payout, won);
      return respond.reply(message, won ? 'good' : 'bad', `${roll.join(' | ')}\nYou ${won ? 'won' : 'lost'} **${formatCoins(payout)}** ${settings.currencyIcon}.`);
    }

    return respond.reply(message, 'info', 'Use `casino coinflip <bet> [heads|tails]` or `casino slots <bet>`.');
  }
};
