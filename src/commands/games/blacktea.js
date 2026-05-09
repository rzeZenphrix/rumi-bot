const { runBlackTea } = require('../../systems/fun/teaGames');

module.exports = {
  name: 'blacktea',
  aliases: ['bt', 'black-tea'],
  category: 'fun',
  description: 'Start a turn-based word survival tea game.',
  usage: 'blacktea [lives] [seconds]',
  examples: ['blacktea', 'blacktea 3 15'],
  guildOnly: true,
  cooldown: 10,

  async execute({ message, args }) {
    return runBlackTea(message, args);
  }
};