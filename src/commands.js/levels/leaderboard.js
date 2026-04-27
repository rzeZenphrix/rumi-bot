const respond = require('../../utils/respond');
const { getGuildLevels } = require('../../systems/levels/levelStore');
const { getProfile } = require('../../systems/social/store');

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'xpleaderboard'],
  category: 'levels',
  description: 'Shows the XP leaderboard.',
  usage: 'leaderboard',

  async execute({ message }) {
    const config = await getGuildLevels(message.guild.id);
    const rows = await Promise.all(
      Object.entries(config.users || {}).map(async ([userId, data]) => ({
        userId,
        data,
        profile: await getProfile(userId).catch(() => ({ hideLeaderboard: false }))
      }))
    );

    const entries = rows
      .filter((entry) => !entry.profile?.hideLeaderboard)
      .sort((a, b) => b.data.xp - a.data.xp)
      .slice(0, 10);

    if (!entries.length) {
      return respond.reply(message, 'info', 'No XP has been earned yet.');
    }

    return respond.reply(message, 'list', null, {
      description: entries
        .map((entry, index) => `**${index + 1}.** <@${entry.userId}> - Level **${entry.data.level}**, **${entry.data.xp} XP**`)
        .join('\n'),
      mentionUser: false
    });
  }
};
