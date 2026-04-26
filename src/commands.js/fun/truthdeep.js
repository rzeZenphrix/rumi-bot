const respond = require('../../utils/respond');
module.exports = {
  name: 'truthdeep',
  aliases: ["deeptruth"],
  category: 'fun',
  description: "Get a deeper truth prompt.",
  usage: 'truthdeep',
  async execute({ message }) {
    return respond.reply(message, 'info', "What is one thing you wish people understood about you?", { mentionUser: false });
  }
};
