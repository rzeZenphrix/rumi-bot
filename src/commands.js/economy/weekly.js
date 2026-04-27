const respond = require('../../utils/respond');
const { addEarnings, getAccount, saveAccount, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

function formatRemaining(ms) {
  const totalHours = Math.ceil(ms / (60 * 60 * 1000));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return `${days}d ${hours}h`;
}

module.exports = {
  name: 'weekly',
  aliases: [],
  category: 'economy',
  description: 'Claim a weekly reward.',
  usage: 'weekly',
  examples: ['weekly'],
  guildOnly: true,

  async execute({ message }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'weekly'))) {
      return respond.reply(message, 'bad', 'The weekly command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const cooldownMs = Number(settings.weeklyCooldownSeconds || 604800) * 1000;
    const current = await getAccount(message.guild.id, message.author.id);
    const remaining = Number(current.lastWeekly || 0) + cooldownMs - Date.now();
    if (remaining > 0) {
      return respond.reply(message, 'bad', `You already claimed your weekly reward. Come back in **${formatRemaining(remaining)}**.`);
    }

    const boostActive = Boolean(access?.hasVoter && (access.economy.canDisableVoterBoost ? settings.voterBoostEnabled !== false : true));
    const reward = Math.floor(settings.weeklyBase * (boostActive ? access.economy.voterMultiplier : 1));
    current.lastWeekly = Date.now();
    const account = await addEarnings(message.guild.id, message.author.id, reward, 'weekly');
    account.lastWeekly = current.lastWeekly;
    await saveAccount(message.guild.id, message.author.id, account);

    return respond.reply(message, 'good', `Weekly claimed. I gave you **${settings.currencyIcon} ${formatCoins(reward)}** ${settings.currencyName}${boostActive ? ' with your voter boost applied' : ''}, and you now have **${settings.currencyIcon} ${formatCoins(account.cash)}**.`);
  }
};
