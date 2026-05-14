const { runWordChain } = require('../../systems/fun/teaGames');

module.exports = {
  name: 'wordchain',
  aliases: ['chainword'],
  category: 'fun',
  description: 'Start a word chain survival game.',
  usage: 'wordchain [lives] [seconds]',
  examples: ['wordchain', 'wordchain 2 15'],
  guildOnly: true,
  cooldown: 10,

  async execute({ message, args }) {
    return runWordChain(message, args);
  }
};
