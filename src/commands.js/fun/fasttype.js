const respond = require('../../utils/respond');
module.exports = {
  name: 'fasttype',
  aliases: ["typingtest"],
  category: 'fun',
  description: "Send a fast typing phrase.",
  usage: 'fasttype',
  async execute({ message }) {
    return respond.reply(message, 'info', "Type this: silver shadows move softly", { mentionUser: false });
  }
};
