const { runRedTea } = require('../../systems/fun/teaGames');

module.exports = {
  name: 'redtea',
  aliases: ['rt', 'red-tea'],
  category: 'fun',
  description: 'Start a speed tea game where missers or the slowest player lose lives.',
  usage: 'redtea [lives] [seconds]',
  examples: ['redtea', 'redtea 2 12'],
  guildOnly: true,
  cooldown: 10,

  async execute({ message, args }) {
    return runRedTea(message, args);
  }
};