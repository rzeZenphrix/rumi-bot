const { runGreenTea } = require('../../systems/fun/teaGames');

module.exports = {
  name: 'greentea',
  aliases: ['gt', 'green-tea'],
  category: 'fun',
  description: 'Start a fast word race tea game.',
  usage: 'greentea [points] [seconds]',
  examples: ['greentea', 'greentea 7 12'],
  guildOnly: true,
  cooldown: 10,

  async execute({ message, args }) {
    return runGreenTea(message, args);
  }
};