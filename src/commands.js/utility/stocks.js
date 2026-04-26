const respond = require('../../utils/respond');
module.exports = {
  name: 'stocks',
  aliases: ["stock"],
  category: 'utility',
  description: "Stock price lookup.",
  usage: 'stocks',
  async execute({ message }) {
    return respond.reply(message, 'info', "Stock lookup command is registered.", { mentionUser: false });
  }
};
