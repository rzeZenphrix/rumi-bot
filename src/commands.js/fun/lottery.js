const respond = require('../../utils/respond');
module.exports = {
  name: 'lottery',
  aliases: ["lotto"],
  category: 'fun',
  description: "Generate lottery numbers.",
  usage: 'lottery',
  async execute({ message }) {
    return respond.reply(message, 'info', "Lucky draw: 4 9 16 21 33 42", { mentionUser: false });
  }
};
