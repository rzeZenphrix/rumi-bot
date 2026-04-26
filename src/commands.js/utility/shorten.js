const respond = require('../../utils/respond');
module.exports = {
  name: 'shorten',
  aliases: ["shorturl"],
  category: 'utility',
  description: "Shorten a URL.",
  usage: 'shorten',
  async execute({ message }) {
    return respond.reply(message, 'info', "URL shortener command is registered.", { mentionUser: false });
  }
};
