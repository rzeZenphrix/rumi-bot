const respond = require('../../utils/respond');
const { getProfile } = require('../../systems/social/store');
const { getLeaderboard, formatCoins, totalWealth } = require('../../systems/economy/store');
const { getEconomySettings } = require('../../systems/economy/settings');

module.exports = {
  name: 'economytop',
  aliases: ['richest', 'baltop'],
  category: 'economy',
  description: 'See the richest members in this server economy.',
  usage: 'economytop',
  examples: ['economytop'],
  guildOnly: true,

  async execute({ message }) {
    const settings = await getEconomySettings(message.guild.id);
    const leaderboard = await getLeaderboard(message.guild.id, 25);
    const visible = [];

    for (const entry of leaderboard) {
      const profile = await getProfile(entry.userId).catch(() => ({ hideLeaderboard: false }));
      if (profile?.hideLeaderboard) continue;
      visible.push(entry);
      if (visible.length >= 10) break;
    }

    const lines = await Promise.all(
      visible.map(async (entry, index) => {
        const member = await message.guild.members.fetch(entry.userId).catch(() => null);
        const label = member?.user?.tag || `Unknown User (${entry.userId})`;
        return `${index + 1}. **${label}** - ${settings.currencyIcon} ${formatCoins(totalWealth(entry.account))}`;
      })
    );

    return respond.reply(message, 'info', null, {
      mentionUser: false,
      description: lines.length ? lines.join('\n') : 'No economy data yet.'
    });
  }
};
