const respond = require('../../utils/respond');
module.exports = {
  name: 'fortune',
  aliases: ["cookie"],
  category: 'fun',
  description: "Get a fortune-style message.",
  usage: 'fortune',
  async execute({ message }) {
    return respond.reply(message, 'info', "The stars are on your side today.", { mentionUser: false });
  }
};
