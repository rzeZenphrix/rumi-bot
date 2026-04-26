const respond = require('../../utils/respond');
module.exports = {
  name: 'crypto',
  aliases: ["coinprice"],
  category: 'utility',
  description: "Crypto price lookup.",
  usage: 'crypto',
  async execute({ message }) {
    return respond.reply(message, 'info', "Crypto lookup command is registered.", { mentionUser: false });
  }
};
