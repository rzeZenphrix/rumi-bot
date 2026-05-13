const respond = require('../../utils/respond');

module.exports = {
  name: 'luck',
  aliases: ["luckscore"],
  category: 'fun',
  description: "Gives you a luck score.",
  usage: "luck",
  examples: ["luck"],

  async execute({ message, args }) {
    return respond.reply(message, '', `think your luck is **${Math.floor(Math.random() * 101)}%** today.`);
  }
};
