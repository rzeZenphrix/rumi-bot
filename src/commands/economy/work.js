const respond = require('../../utils/respond');
const { addEarnings, getAccount, saveAccount, formatCoins } = require('../../systems/economy/store');
const { getEconomySettings, isEconomyCommandEnabled } = require('../../systems/economy/settings');
const { getPremiumAccessForMessage } = require('../../systems/monetization/access');

const jobs = [
  'moderated a server',
  'debugged a bot',
  'made pixel art',
  'sorted a dashboard',
  'guarded a gateway'
];

module.exports = {
  name: 'work',
  aliases: ['job'],
  category: 'economy',
  description: 'Work for coins.',
  usage: 'work',
  examples: ['work'],
  guildOnly: true,

  async execute({ message }) {
    if (!(await isEconomyCommandEnabled(message.guild.id, 'work'))) {
      return respond.reply(message, 'bad', 'The work command is disabled in this server economy.');
    }

    const settings = await getEconomySettings(message.guild.id);
    const access = await getPremiumAccessForMessage(message).catch(() => null);
    const current = await getAccount(message.guild.id, message.author.id);
    const cooldownMs = Number(settings.workCooldownSeconds || 3600) * 1000;
    const remaining = Number(current.lastWork || 0) + cooldownMs - Date.now();
    if (remaining > 0) {
      const minutes = Math.ceil(remaining / 60000);
      return respond.reply(message, 'bad', `You need to wait **${minutes} minute${minutes === 1 ? '' : 's'}** before working again.`);
    }

    const baseEarned = settings.workMin + Math.floor(Math.random() * (settings.workMax - settings.workMin + 1));
    const boostActive = Boolean(access?.hasVoter && (access.economy.canDisableVoterBoost ? settings.voterBoostEnabled !== false : true));
    const earned = Math.floor(baseEarned * (boostActive ? access.economy.voterMultiplier : 1));
    const account = await addEarnings(message.guild.id, message.author.id, earned, 'work');
    account.lastWork = Date.now();
    await saveAccount(message.guild.id, message.author.id, account);

    const job = jobs[Math.floor(Math.random() * jobs.length)];
    return respond.reply(message, 'good', `You ${job} and earned **${settings.currencyIcon} ${formatCoins(earned)}** ${settings.currencyName}${boostActive ? ' with your voter boost applied' : ''}. Cash: **${settings.currencyIcon} ${formatCoins(account.cash)}**.`);
  }
};
