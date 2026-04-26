const respond = require('../../utils/respond');
module.exports = {
  name: 'youtube',
  aliases: ["yt"],
  category: 'utility',
  description: "Search YouTube.",
  usage: 'youtube',
  async execute({ message }) {
    return respond.reply(message, 'info', "YouTube command is registered.", { mentionUser: false });
  }
};
