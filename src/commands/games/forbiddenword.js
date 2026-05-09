const { runForbiddenWord } = require('../../systems/fun/teaGames');

module.exports = {
  name: 'forbiddenword',
  aliases: ['fw', 'forbidden'],
  category: 'fun',
  description: 'Start a chat survival game where saying the forbidden word eliminates you.',
  usage: 'forbiddenword [seconds]',
  examples: ['forbiddenword', 'forbiddenword 30'],
  guildOnly: true,
  cooldown: 10,

  async execute({ message, args }) {
    return runForbiddenWord(message, args);
  }
};