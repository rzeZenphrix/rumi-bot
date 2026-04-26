const respond = require('../../utils/respond');
const { getGuildLevels } = require('../../systems/levels/levelStore');

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'xpleaderboard'],
  category: 'levels',
  description: 'Shows the XP leaderboard.',
  usage: 'leaderboard',

  async execute({ message }) {
    const config = getGuildLevels(message.guild.id);

    const entries = Object.entries(config.users || {})
      .sort(([, a], [, b]) => b.xp - a.xp)
      .slice(0, 10);

    if (!entries.length) {
      return respond.reply(message, 'info', 'No XP has been earned yet.');
    }

    return respond.reply(message, 'list', null, {
      description: entries
        .map(([userId, data], index) => `**${index + 1}.** <@${userId}> — Level **${data.level}**, **${data.xp} XP**`)
        .join('\n'),
      mentionUser: false
    });
  }
};