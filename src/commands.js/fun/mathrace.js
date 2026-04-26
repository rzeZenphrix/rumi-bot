const respond = require('../../utils/respond');
module.exports = {
  name: 'mathrace',
  aliases: ["quickmath"],
  category: 'fun',
  description: "Send a quick math race problem.",
  usage: 'mathrace',
  async execute({ message }) {
    return respond.reply(message, 'info', "Quick math: 17 + 26 = ?", { mentionUser: false });
  }
};
