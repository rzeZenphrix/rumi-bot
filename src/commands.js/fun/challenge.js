const respond = require('../../utils/respond');
module.exports = {
  name: 'challenge',
  aliases: ["dailychallenge"],
  category: 'fun',
  description: "Get a small challenge.",
  usage: 'challenge',
  async execute({ message }) {
    return respond.reply(message, 'info', "Send one helpful message in the server today.", { mentionUser: false });
  }
};
