const { runUnscramble } = require('../../systems/fun/teaGames');

module.exports = {
  name: 'unscramble',
  aliases: ['scramble', 'unjumble'],
  category: 'fun',
  description: 'Start a fast word unscramble race.',
  usage: 'unscramble [points] [seconds]',
  examples: ['unscramble', 'unscramble 7 12'],
  guildOnly: true,
  cooldown: 10,

  async execute({ message, args }) {
    return runUnscramble(message, args);
  }
};