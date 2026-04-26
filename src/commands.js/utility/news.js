const respond = require('../../utils/respond');
module.exports = {
  name: 'news',
  aliases: ["headlines"],
  category: 'utility',
  description: "Show news headlines.",
  usage: 'news',
  async execute({ message }) {
    return respond.reply(message, 'info', "News command is registered.", { mentionUser: false });
  }
};
