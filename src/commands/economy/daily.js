const respond = require('../../utils/respond');
const { updateAccount, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

module.exports = {
  name: 'daily',
  aliases: [],
  category: 'economy',
  description: 'Claim a daily reward.',
  usage: 'daily',
  examples: ['daily'],
  guildOnly: true,

  async execute({ message }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'daily'))) {
      return respond.reply(message, 'bad', 'The daily command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    let blocked = null;
    const boostActive = Boolean(access?.hasVoter && (access.economy.canDisableVoterBoost ? settings.voterBoostEnabled !== false : true));
    const reward = Math.floor(settings.dailyBase * (boostActive ? access.economy.voterMultiplier : 1));
    const cooldownMs = Number(settings.dailyCooldownSeconds || 86400) * 1000;

    const account = await updateAccount(message.guild.id, message.author.id, (draft) => {
      if (draft.lastDaily && Date.now() - draft.lastDaily < cooldownMs) {
        blocked = true;
        return draft;
      }

      draft.cash = Number(draft.cash || 0) + reward;
      draft.totalEarned = Number(draft.totalEarned || 0) + reward;
      draft.lastDaily = Date.now();
      return draft;
    });

    if (blocked) {
      return respond.reply(message, 'bad', 'You already claimed your daily reward.');
    }

    return respond.reply(message, 'good', `Gave you **${settings.currencyIcon} ${formatCoins(reward)}** ${settings.currencyName}${boostActive ? ' with your voter boost applied' : ''}. You now have **${settings.currencyIcon} ${formatCoins(account.cash)}**.`);
  }
};
