const respond = require('../../utils/respond');
module.exports = {
  name: 'emojiquiz',
  aliases: ["guessemoji"],
  category: 'fun',
  description: "Start an emoji quiz.",
  usage: 'emojiquiz',
  async execute({ message }) {
    return respond.reply(message, 'info', "Guess: 🦁👑", { mentionUser: false });
  }
};
