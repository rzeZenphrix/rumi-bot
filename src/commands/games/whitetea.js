const { runWhiteTea } = require('../../systems/fun/teaGames');

module.exports = {
  name: 'whitetea',
  aliases: ['wt', 'white-tea'],
  category: 'fun',
  description: 'Start a reverse tea game where players avoid the forbidden fragment.',
  usage: 'whitetea [lives] [seconds]',
  examples: ['whitetea', 'whitetea 3 15'],
  guildOnly: true,
  cooldown: 10,

  async execute({ message, args }) {
    return runWhiteTea(message, args);
  }
};